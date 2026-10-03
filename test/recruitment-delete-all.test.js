import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createSignedCookieCodec } from "../server/recruitment-access.js";
import { createRecruitmentApp } from "../server/app.js";
import { createRecruitmentDatabase } from "../server/recruitment-db.js";
import { createRecruitmentService } from "../server/recruitment-service.js";
import { createRecruitmentStorage } from "../server/recruitment-storage.js";

const MARKER = "SYNTHETIC-REMOVE-ALL-PRIVATE-MARKER";
const NOW = new Date("2026-10-15T12:00:00.000Z");

async function fixture() {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "patch-website-delete-all-"));
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const rawDatabase = new DatabaseSync(storage.databasePath);
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: rawDatabase });
  let emailAttempts = 0;
  const emailSender = {
    configured: true,
    async sendOutcome() {
      emailAttempts += 1;
      throw new Error("Deletion must never send an email");
    },
  };
  const serviceOptions = { database, storage, emailSender, now: () => NOW };
  const service = createRecruitmentService(serviceOptions);
  const previous = (await service.createAndActivateCohort({
    password: "synthetic-previous-password",
    opensAt: "2026-09-01T00:00",
    closesAt: "2026-09-30T23:59",
  })).current;
  const current = (await service.createAndActivateCohort({
    password: "synthetic-current-password",
    opensAt: "2026-10-01T00:00",
    closesAt: "2026-10-31T23:59",
  })).current;

  function createStoredWindow(monthKey) {
    return database.createNextCohort({
      monthKey,
      displayName: `${MARKER}-${monthKey}`,
      passwordSalt: Buffer.from(`${MARKER}-salt`),
      passwordHash: Buffer.from(`${MARKER}-hash`),
      passwordParameters: "synthetic-only",
      opensAt: `${monthKey}-01T00:00:00.000Z`,
      closesAt: `${monthKey}-28T23:59:00.000Z`,
      createdAt: NOW.toISOString(),
    });
  }
  const legacy = createStoredWindow("2026-11");
  rawDatabase.prepare("UPDATE recruitment_cohorts SET slot = NULL WHERE cohort_id = ?").run(legacy.cohortId);
  const next = createStoredWindow("2026-12");
  const records = [];
  for (const cohort of [previous, current, legacy, next]) {
    for (const decision of ["pending", "pass", "fail"]) {
      const stored = storage.storeAudio(cohort.monthKey || cohort.slug, Buffer.from(`${MARKER}-voice`), "audio/webm");
      const record = database.createApplication({
        cohortId: cohort.cohortId,
        fullName: `${MARKER}-${decision}`,
        email: `${MARKER.toLowerCase()}@example.com`,
        linkedinUrl: `https://example.com/${MARKER}`,
        audioStorageKey: stored.storageKey,
        audioMimeType: stored.mimeType,
        audioFileSize: stored.fileSize,
        audioDurationSeconds: 1,
        submittedAt: NOW.toISOString(),
      });
      if (decision !== "pending") {
        database.decideApplication(record.applicationId, decision, NOW.toISOString());
        database.recordEmailResult(record.applicationId, {
          ok: decision === "pass",
          providerId: `${MARKER}-provider`,
          error: `${MARKER}-delivery-error`,
        });
      }
      records.push({ ...record, filePath: stored.filePath });
    }
  }

  // Synthetic leftovers model interrupted uploads, old quarantines, and unreferenced audio.
  const orphanPaths = [
    path.join(storage.audioDirectory, "2020-01", "orphan.webm"),
    path.join(storage.audioDirectory, "untracked.private"),
    path.join(dataRoot, ".staging", "interrupted", "upload.pending"),
    path.join(dataRoot, ".trash", "old-operation", "2020-02", "orphan.webm"),
  ];
  for (const filePath of orphanPaths) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, MARKER);
  }
  const applicant = await service.unlockApplicant("synthetic-current-password");
  return {
    dataRoot, storage, database, rawDatabase, service, serviceOptions,
    previous, current, legacy, next, records, orphanPaths, applicant,
    emailAttempts: () => emailAttempts,
    close() {
      database.close();
      rmSync(dataRoot, { recursive: true, force: true });
    },
  };
}

function assertNoManagedAudio(f) {
  for (const directory of [f.storage.audioDirectory, path.join(f.dataRoot, ".staging"), path.join(f.dataRoot, ".trash")]) {
    assert.deepEqual(readdirSync(directory), [], `${path.basename(directory)} contains no retained audio`);
  }
}

function assertNoRows(f) {
  assert.deepEqual(f.database.listCohorts(), []);
  assert.deepEqual(f.database.listAudioStorageKeys(), []);
  assert.deepEqual(f.service.listPendingApplications(), []);
  assert.deepEqual(f.service.listProcessedApplications(), []);
  assert.deepEqual(f.service.listCohortControls(), { current: null, previous: null, next: null });
}

function assertNoMarkerInDatabase(databasePath) {
  for (const filePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(filePath)) {
      assert.equal(readFileSync(filePath).includes(Buffer.from(MARKER)), false, `${path.basename(filePath)} has no deleted private marker`);
    }
  }
}

test("Remove permanently empties Inbox, Pass, Fail, legacy records, and every private audio directory", async () => {
  const f = await fixture();
  try {
    const preview = f.database.previewDeleteCurrentCohort(f.current.cohortId);
    assert.deepEqual(new Set(preview.monthKeys), new Set(["2026-09", "2026-10", "2026-11", "2026-12"]));
    assert.equal(preview.audioStorageKeys.length, 12);
    assert.equal(f.service.listPendingApplications().length, 1);
    assert.equal(f.service.listProcessedApplications().length, 4);
    assert.equal(
      [f.storage.databasePath, `${f.storage.databasePath}-wal`]
        .some((filePath) => existsSync(filePath) && readFileSync(filePath).includes(Buffer.from(MARKER))),
      true,
      "the fixture genuinely contains private markers before removal",
    );

    const removed = f.service.deleteCurrentCohort(f.current.cohortId);
    assert.equal(removed.deletionComplete, true);
    assert.equal(removed.deletedCohortId, f.current.cohortId);
    assert.equal(removed.deletedAudioCount, 12);
    assertNoRows(f);
    assertNoManagedAudio(f);
    assertNoMarkerInDatabase(f.storage.databasePath);
    for (const record of f.records) {
      assert.equal(f.database.getApplication(record.applicationId), null);
      assert.equal(existsSync(record.filePath), false);
      assert.throws(() => f.service.getReviewerAudio(record.applicationId), (error) => error.code === "application_missing" && error.statusCode === 404);
    }
    assert.throws(() => f.service.validateApplicantSession(f.applicant.sessionPayload), (error) => error.code === "applicant_session_expired");
    await assert.rejects(f.service.unlockApplicant("synthetic-current-password"), (error) => error.code === "cohort_not_open");
    assert.equal(f.emailAttempts(), 0);

    const reopened = createRecruitmentDatabase({ databasePath: f.storage.databasePath });
    try {
      assert.deepEqual(reopened.listCohorts(), []);
      assert.deepEqual(reopened.listAudioStorageKeys(), []);
      assert.deepEqual(reopened.listProcessedApplications(), []);
    } finally {
      reopened.close();
    }
    assertNoMarkerInDatabase(f.storage.databasePath);

    const replacement = await f.service.createAndActivateCohort({
      password: "synthetic-replacement-password",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });
    assert.equal(replacement.previous, null);
    assert.equal(replacement.current.applicationCount, 0);
    assert.deepEqual(f.service.listPendingApplications(), []);
    assert.deepEqual(f.service.listProcessedApplications(), []);
    assertNoManagedAudio(f);
    assertNoMarkerInDatabase(f.storage.databasePath);
  } finally {
    f.close();
  }
});

test("a failed database removal restores recordings for every window and leaves all records intact", async () => {
  const f = await fixture();
  const failingService = createRecruitmentService({
    ...f.serviceOptions,
    database: {
      ...f.database,
      deleteCurrentCohort() { throw new Error("simulated transaction rollback"); },
    },
  });
  try {
    assert.throws(() => failingService.deleteCurrentCohort(f.current.cohortId), /simulated transaction rollback/);
    assert.equal(f.database.listCohorts().length, 4);
    assert.equal(f.database.listAudioStorageKeys().length, 12);
    for (const record of f.records) {
      assert.ok(f.database.getApplication(record.applicationId));
      assert.equal(readFileSync(record.filePath, "utf8"), `${MARKER}-voice`);
    }
    for (const filePath of f.orphanPaths) assert.equal(readFileSync(filePath, "utf8"), MARKER);
    assert.deepEqual(readdirSync(path.join(f.dataRoot, ".trash")), ["old-operation"]);
    f.service.validateApplicantSession(f.applicant.sessionPayload);
    assert.equal(f.emailAttempts(), 0);
  } finally {
    f.close();
  }
});

test("a stale removal target never purges a replacement window or its recordings", async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.service.deleteCurrentCohort(f.previous.cohortId), (error) => error.code === "cohort_delete_target_mismatch" && error.statusCode === 409);
    assert.equal(f.database.listAudioStorageKeys().length, 12);
    for (const record of f.records) assert.equal(existsSync(record.filePath), true);
    for (const filePath of f.orphanPaths) assert.equal(existsSync(filePath), true);

    const stalePreview = f.database.previewDeleteCurrentCohort(f.current.cohortId);
    f.service.deleteCurrentCohort(f.current.cohortId);
    const replacement = await f.service.createAndActivateCohort({
      password: "synthetic-fresh-password",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });
    const freshSession = await f.service.unlockApplicant("synthetic-fresh-password");
    const fresh = f.service.submitApplication({
      sessionPayload: freshSession.sessionPayload,
      fullName: "Synthetic Fresh Applicant",
      email: "fresh@example.com",
      linkedinUrl: "https://example.com/fresh",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("fresh synthetic voice"),
      audioMimeType: "audio/webm",
    });
    assert.throws(() => f.service.deleteCurrentCohort(f.current.cohortId), (error) => error.code === "cohort_delete_target_mismatch");
    assert.throws(() => f.database.deleteCurrentCohort(stalePreview), (error) => error.code === "cohort_delete_conflict");
    assert.equal(f.database.getCohortBySlot("current").cohortId, replacement.current.cohortId);
    assert.ok(f.service.getReviewerAudio(fresh.application.applicationId));
    assert.equal(f.emailAttempts(), 0);
  } finally {
    f.close();
  }
});

test("database erasure failure is reported and an empty-state removal retry finishes cleanup", async () => {
  const f = await fixture();
  let shouldFail = true;
  let erasureAttempts = 0;
  const service = createRecruitmentService({
    ...f.serviceOptions,
    database: {
      ...f.database,
      eraseDeletedContent() {
        erasureAttempts += 1;
        if (shouldFail) throw new Error("simulated checkpoint failure");
        return f.database.eraseDeletedContent();
      },
    },
  });
  try {
    assert.throws(() => service.deleteCurrentCohort(f.current.cohortId), (error) => error.code === "recruitment_deletion_cleanup_failed" && error.statusCode === 503);
    assertNoRows(f);
    assertNoManagedAudio(f);
    shouldFail = false;
    const retried = service.deleteCurrentCohort(f.current.cohortId);
    assert.equal(retried.deletedCohortId, f.current.cohortId);
    assert.equal(retried.deletionComplete, true);
    assert.equal(erasureAttempts, 2);
    assertNoMarkerInDatabase(f.storage.databasePath);
  } finally {
    f.close();
  }
});

test("authenticated Remove retries finish failed audio cleanup without exposing removed cards or audio", async () => {
  const f = await fixture();
  let shouldFail = true;
  let cleanupAttempts = 0;
  const service = createRecruitmentService({
    ...f.serviceOptions,
    storage: {
      ...f.storage,
      recoverInterruptedOperations(months, keys) {
        cleanupAttempts += 1;
        assert.deepEqual(months, []);
        assert.deepEqual(keys, []);
        if (shouldFail) throw new Error("simulated audio cleanup failure");
        return f.storage.recoverInterruptedOperations(months, keys);
      },
    },
  });
  const app = await createRecruitmentApp({
    service,
    cookieCodec: createSignedCookieCodec("synthetic-delete-all-cookie-secret-at-least-32-bytes"),
    reviewerSecret: "DELETEALL123",
    secureCookies: false,
  });
  let server;
  try {
    server = await new Promise((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve(listening));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const exchange = await fetch(`${baseUrl}/assessment/DELETEALL123`, { redirect: "manual" });
    assert.equal(exchange.status, 303);
    const reviewerCookie = exchange.headers.get("set-cookie").split(";", 1)[0];
    const headers = { Cookie: reviewerCookie, "Content-Type": "application/json" };
    const removeUrl = `${baseUrl}/api/recruitment/reviewer/cohorts/${f.current.cohortId}`;

    const unconfirmed = await fetch(removeUrl, { method: "DELETE", headers, body: JSON.stringify({ confirm: false }) });
    assert.equal(unconfirmed.status, 400);
    assert.equal(f.database.listAudioStorageKeys().length, 12);
    const failed = await fetch(removeUrl, { method: "DELETE", headers, body: JSON.stringify({ confirm: true }) });
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).code, "recruitment_deletion_cleanup_failed");
    assertNoRows(f);
    assert.notDeepEqual(readdirSync(path.join(f.dataRoot, ".trash")), [], "failed purge has not been falsely reported as complete");
    const state = await (await fetch(`${baseUrl}/api/recruitment/reviewer/state`, { headers })).json();
    assert.deepEqual(state.queue, []);
    assert.deepEqual(state.history, []);
    for (const record of f.records) {
      const audio = await fetch(`${baseUrl}/api/recruitment/reviewer/applications/${record.applicationId}/audio`, { headers });
      assert.equal(audio.status, 404);
    }

    shouldFail = false;
    const anonymous = await fetch(removeUrl, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
    });
    assert.equal(anonymous.status, 401);
    assert.equal(cleanupAttempts, 1, "an anonymous request cannot finish the deletion");
    const completed = await fetch(removeUrl, { method: "DELETE", headers, body: JSON.stringify({ confirm: true }) });
    assert.equal(completed.status, 200);
    const result = await completed.json();
    assert.equal(result.deletedCohortId, f.current.cohortId);
    assert.equal(result.deletionComplete, true);
    assert.equal(cleanupAttempts, 2);
    assertNoRows(f);
    assertNoManagedAudio(f);
    assertNoMarkerInDatabase(f.storage.databasePath);
    assert.equal(f.emailAttempts(), 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    f.close();
  }
});
