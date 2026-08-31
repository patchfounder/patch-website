import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSignedCookieCodec } from "../server/recruitment-access.js";
import { createRecruitmentApp } from "../server/app.js";
import { createRecruitmentDatabase } from "../server/recruitment-db.js";
import { createRecruitmentService } from "../server/recruitment-service.js";
import { createRecruitmentStorage, resolveRecruitmentDataRoot } from "../server/recruitment-storage.js";

function temporaryDataRoot(label) {
  return mkdtempSync(path.join(tmpdir(), `patch-website-${label}-`));
}

test("service preserves only current/previous cohorts and attempts each outcome email once", async () => {
  const dataRoot = temporaryDataRoot("recruitment-core");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  assert.equal(statSync(storage.databasePath).mode & 0o777, 0o600);
  assert.equal(statSync(storage.audioDirectory).mode & 0o777, 0o700);
  let now = new Date("2026-08-31T12:00:00.000Z");
  const deliveries = [];
  const emailSender = {
    configured: true,
    async sendOutcome(application) {
      deliveries.push({ id: application.applicationId, decision: application.decision });
      if (application.decision === "fail") throw new Error("provider rejected message");
      return { ok: true, providerId: "resend-one" };
    },
  };
  const service = createRecruitmentService({ database, storage, emailSender, now: () => now });

  try {
    await assert.rejects(
      service.unlockApplicant("unused-password"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "no cohort means no applicant can log in",
    );
    const septemberDraft = await service.createNextCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    assert.equal(septemberDraft.slug, "2026-09");
    assert.equal(septemberDraft.displayName, "September 2026");
    service.activateNextCohort(septemberDraft.cohortId);
    await assert.rejects(
      service.unlockApplicant("shared-september-password"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "a cohort password cannot be used before its opening time",
    );

    now = new Date("2026-09-15T10:00:00.000Z");
    await assert.rejects(
      service.unlockApplicant("wrong-password"),
      (error) => error.code === "invalid_cohort_password",
    );
    const unlocked = await service.unlockApplicant("shared-september-password");

    const first = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Alex Applicant",
      email: "same@example.com",
      linkedinUrl: "https://www.linkedin.com/in/alex-applicant/",
      audioDurationSeconds: 0,
      audioBuffer: Buffer.from("first-private-audio"),
      audioMimeType: "audio/webm;codecs=opus",
    });
    const firstRecord = database.getApplication(first.application.applicationId);
    assert.match(firstRecord.audioStorageKey, /^2026-09\/[0-9a-f-]+\.webm$/);
    assert.equal(firstRecord.audioDurationSeconds, 0);
    assert.equal(existsSync(path.join(storage.audioDirectory, firstRecord.audioStorageKey)), true);

    now = new Date("2026-09-15T10:01:00.000Z");
    const second = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Alex Applicant",
      email: "same@example.com",
      linkedinUrl: "https://linkedin.com/in/alex-applicant/",
      audioDurationSeconds: 60,
      audioBuffer: Buffer.from("second-private-audio"),
      audioMimeType: "audio/ogg",
    });
    const secondRecord = database.getApplication(second.application.applicationId);
    assert.equal(secondRecord.email, firstRecord.email, "duplicate details are deliberately allowed");
    assert.deepEqual(
      service.listPendingApplications().map((application) => application.applicationId),
      [firstRecord.applicationId, secondRecord.applicationId],
    );
    writeFileSync(path.join(storage.audioDirectory, "2026-09", "orphan.private"), "orphan");

    now = new Date("2026-09-15T10:02:00.000Z");
    const passed = await service.decideApplication(firstRecord.applicationId, "pass");
    assert.equal(passed.email.status, "sent");
    assert.equal(database.getApplication(firstRecord.applicationId).emailAttemptCount, 1);
    await assert.rejects(
      service.decideApplication(firstRecord.applicationId, "fail"),
      (error) => error.code === "application_already_decided",
    );
    assert.equal(deliveries.length, 1);

    now = new Date("2026-09-15T10:03:00.000Z");
    const failed = await service.decideApplication(secondRecord.applicationId, "fail");
    assert.equal(failed.email.status, "failed");
    assert.equal(database.getApplication(secondRecord.applicationId).emailAttemptCount, 1);
    await assert.rejects(
      service.decideApplication(secondRecord.applicationId, "fail"),
      (error) => error.code === "application_already_decided",
    );
    assert.equal(deliveries.length, 2, "provider failures are never retried");
    assert.deepEqual(
      service.listProcessedApplications().map((application) => application.applicationId),
      [secondRecord.applicationId, firstRecord.applicationId],
    );

    const octoberDraft = await service.createNextCohort({
      slug: "2026-10",
      displayName: "October 2026",
      password: "shared-october-password",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });
    service.activateNextCohort(octoberDraft.cohortId);
    assert.throws(
      () => service.validateApplicantSession(unlocked.sessionPayload),
      (error) => error.code === "applicant_session_expired",
      "an early activation immediately prevents submissions to the previous cohort",
    );

    now = new Date("2026-10-15T10:00:00.000Z");
    const octoberUnlocked = await service.unlockApplicant("shared-october-password");
    const octoberApplication = service.submitApplication({
      sessionPayload: octoberUnlocked.sessionPayload,
      fullName: "October Applicant",
      email: "october@example.com",
      linkedinUrl: "https://linkedin.com/in/october-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("october-private-audio"),
      audioMimeType: "audio/webm",
    });
    await service.decideApplication(octoberApplication.application.applicationId, "pass");
    const perCohortHistory = service.listProcessedApplications(1);
    assert.equal(perCohortHistory.length, 2, "each retained cohort keeps its own history window");
    assert.deepEqual(
      new Set(perCohortHistory.map((application) => application.cohortMonth)),
      new Set(["2026-09", "2026-10"]),
    );

    const novemberDraft = await service.createNextCohort({
      slug: "2026-11",
      displayName: "November 2026",
      password: "shared-november-password",
      opensAt: "2026-11-01T00:00",
      closesAt: "2026-11-30T23:59",
    });
    const activated = service.activateNextCohort(novemberDraft.cohortId);
    assert.deepEqual(
      [activated.current.slug, activated.previous.slug],
      ["2026-11", "2026-10"],
    );
    assert.equal(database.getCohortById(septemberDraft.cohortId), null);
    assert.equal(database.getApplication(firstRecord.applicationId), null);
    assert.equal(database.getApplication(secondRecord.applicationId), null);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-09")), false);
    assert.equal(service.healthCheck().emailConfigured, true);
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("a database failure removes the just-promoted private audio", () => {
  const dataRoot = temporaryDataRoot("recruitment-cleanup");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const instant = new Date("2026-09-15T10:00:00.000Z");
  const cohort = {
    cohortId: "current-cohort",
    monthKey: "2026-09",
    slot: "current",
    opensAt: "2026-09-01T00:00:00.000Z",
    closesAt: "2026-10-01T00:00:00.000Z",
  };
  const database = {
    getCohortById: () => cohort,
    createApplication() {
      throw new Error("simulated database failure");
    },
  };
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { async sendOutcome() { return { ok: true, providerId: "unused" }; } },
    now: () => instant,
  });

  try {
    assert.throws(() => service.submitApplication({
      sessionPayload: {
        v: 1,
        kind: "applicant",
        cohortId: cohort.cohortId,
        exp: Math.floor(Date.parse(cohort.closesAt) / 1000),
      },
      fullName: "Cleanup Test",
      email: "cleanup@example.com",
      linkedinUrl: "https://linkedin.com/in/cleanup-test/",
      audioDurationSeconds: 0,
      audioBuffer: Buffer.from("private-audio"),
      audioMimeType: "audio/webm",
    }), /simulated database failure/);
    assert.equal(existsSync(path.join(storage.audioDirectory, cohort.monthKey)), false);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("cohort activation is blocked while applications are still waiting", () => {
  let quarantineCalled = false;
  const service = createRecruitmentService({
    database: {
      previewActivateNext: () => ({
        expectedNextId: "next",
        expectedCurrentId: "current",
        purgeCohortMonths: [],
      }),
      getCohortBySlot: () => ({ cohortId: "current", pendingCount: 1 }),
    },
    storage: {
      quarantineCohorts() {
        quarantineCalled = true;
        return { moved: [] };
      },
    },
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
  });

  assert.throws(
    () => service.activateNextCohort("next"),
    (error) => error.code === "current_cohort_has_pending_applications",
  );
  assert.equal(quarantineCalled, false);
});

test("a missing outcome-email configuration cannot consume a decision", async () => {
  let decisionCalled = false;
  const service = createRecruitmentService({
    database: {
      decideApplication() {
        decisionCalled = true;
      },
    },
    storage: {},
    emailSender: { configured: false, async sendOutcome() { return { ok: false }; } },
  });

  await assert.rejects(
    service.decideApplication("application", "pass"),
    (error) => error.code === "outcome_email_not_configured" && error.statusCode === 503,
  );
  assert.equal(decisionCalled, false);
});

test("production health requires an explicit Website-volume acknowledgement", () => {
  assert.throws(
    () => resolveRecruitmentDataRoot({
      NODE_ENV: "production",
      RECRUITMENT_DATA_ROOT: "/some-other-service/recruitment",
    }),
    (error) => error.code === "invalid_data_root",
  );
  assert.equal(
    resolveRecruitmentDataRoot({ NODE_ENV: "production", RECRUITMENT_DATA_ROOT: "/data/recruitment" }),
    "/data/recruitment",
  );
  const dataRoot = temporaryDataRoot("recruitment-volume-gate");
  try {
    const unacknowledged = createRecruitmentStorage({
      dataRoot,
      projectRoot: process.cwd(),
      env: { NODE_ENV: "production" },
    });
    unacknowledged.initialize();
    assert.equal(unacknowledged.healthCheck().ok, false);

    const acknowledged = createRecruitmentStorage({
      dataRoot,
      projectRoot: process.cwd(),
      env: {
        NODE_ENV: "production",
        RECRUITMENT_PERSISTENCE_ACK: "website-volume-mounted",
      },
    });
    assert.equal(acknowledged.healthCheck().ok, true);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("startup recovery restores referenced quarantine audio and removes orphans", async () => {
  const dataRoot = temporaryDataRoot("recruitment-recovery");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  const now = new Date("2026-09-15T10:00:00.000Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => now,
  });

  try {
    const draft = await service.createNextCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    service.activateNextCohort(draft.cohortId);
    const unlocked = await service.unlockApplicant("shared-september-password");
    const submitted = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Recovery Applicant",
      email: "recovery@example.com",
      linkedinUrl: "https://linkedin.com/in/recovery-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("referenced-audio"),
      audioMimeType: "audio/webm",
    });
    const record = database.getApplication(submitted.application.applicationId);
    writeFileSync(path.join(dataRoot, ".staging", "interrupted.pending"), "orphan");
    writeFileSync(path.join(storage.audioDirectory, "2026-09", "orphan.webm"), "orphan");
    storage.quarantineCohorts(["2026-09"]);

    const recovered = storage.recoverInterruptedOperations(
      database.listCohortMonthKeys(),
      database.listAudioStorageKeys(),
    );
    assert.equal(recovered.restoredAudioCount, 2);
    assert.equal(existsSync(path.join(storage.audioDirectory, record.audioStorageKey)), true);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-09", "orphan.webm")), false);
    assert.deepEqual(readdirSync(path.join(dataRoot, ".staging")), []);
    assert.deepEqual(readdirSync(path.join(dataRoot, ".trash")), []);
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("HTTP routes match the Website clients, exchange reviewer secret, range-stream, and serve the SPA", async () => {
  const fixtureRoot = temporaryDataRoot("recruitment-http");
  const staticRoot = path.join(fixtureRoot, "site");
  mkdirSync(path.join(staticRoot, "generated"), { recursive: true });
  mkdirSync(path.join(staticRoot, "assets"), { recursive: true });
  writeFileSync(path.join(staticRoot, "index.html"), "<main>website-index</main>");
  writeFileSync(path.join(staticRoot, "generated", "index.html"), "<main>generated-route</main>");
  writeFileSync(path.join(staticRoot, "assets", "asset.txt"), "asset-body");
  const audioPath = path.join(fixtureRoot, "audio.webm");
  writeFileSync(audioPath, "0123456789");

  let submitted;
  let activatedId;
  const currentCohort = {
    id: "current",
    cohortId: "current",
    slug: "2026-09",
    pendingCount: 7,
    processedCount: 11,
  };
  const previousCohort = {
    id: "previous",
    cohortId: "previous",
    slug: "2026-08",
    processedCount: 13,
  };
  const queue = [{ id: "application-one", applicationId: "application-one" }];
  const history = [{ id: "application-old", applicationId: "application-old", decision: "pass" }];
  const service = {
    healthCheck: () => ({ ok: true }),
    getApplicantStatus: () => ({ unlocked: false, state: "open", cohort: currentCohort }),
    async unlockApplicant() {
      return {
        cohort: currentCohort,
        expiresAt: new Date(Date.now() + 60_000),
        sessionPayload: { v: 1, kind: "applicant", cohortId: "current", exp: Math.floor(Date.now() / 1000) + 60 },
      };
    },
    validateApplicantSession(payload) {
      if (!payload) {
        throw Object.assign(new Error("Application access has expired."), {
          code: "applicant_session_expired",
          statusCode: 401,
        });
      }
      return { cohort: currentCohort };
    },
    submitApplication(input) {
      submitted = input;
      return { ok: true, application: { applicationId: "submitted" } };
    },
    listPendingApplications: () => queue,
    listProcessedApplications: () => history,
    listCohortControls: () => ({ current: currentCohort, previous: previousCohort, next: null }),
    getReviewerAudio: () => ({ filePath: audioPath, fileSize: 10, mimeType: "audio/webm" }),
    async decideApplication() { return { application: history[0], email: { status: "sent" } }; },
    async createNextCohort(input) { return { id: "next", cohortId: "next", slug: input.slug }; },
    activateNextCohort(id) { activatedId = id; return { current: { id }, previous: currentCohort }; },
  };
  const app = await createRecruitmentApp({
    service,
    cookieCodec: createSignedCookieCodec("http-test-cookie-secret-is-at-least-32-bytes"),
    reviewerSecret: "ABCDEFGHIJKL",
    secureCookies: false,
    audioInspector: async () => ({ durationSeconds: 0 }),
    staticDirectory: staticRoot,
  });
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", (error) => {
      if (error) reject(error);
      else resolve(listening);
    });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const status = await fetch(`${baseUrl}/api/recruitment/status`);
    assert.equal((await status.json()).state, "open");

    const anonymousMultipart = new FormData();
    anonymousMultipart.append("audio", new Blob(["anonymous"], { type: "audio/webm" }), "anonymous.webm");
    const anonymousSubmission = await fetch(`${baseUrl}/api/recruitment/applications`, {
      method: "POST",
      body: anonymousMultipart,
    });
    assert.equal(anonymousSubmission.status, 401, "anonymous uploads are rejected before parsing audio");
    assert.equal(submitted, undefined);

    const unlock = await fetch(`${baseUrl}/api/recruitment/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "shared" }),
    });
    assert.equal(unlock.status, 200);
    const applicantCookie = unlock.headers.get("set-cookie").split(";", 1)[0];

    const multipart = new FormData();
    multipart.append("fullName", "HTTP Applicant");
    multipart.append("email", "http@example.com");
    multipart.append("linkedin", "https://linkedin.com/in/http-applicant/");
    multipart.append("audioDurationMs", "0");
    multipart.append("audio", new Blob(["voice"], { type: "audio/webm" }), "client-name.webm");
    const submission = await fetch(`${baseUrl}/api/recruitment/applications`, {
      method: "POST",
      headers: { Cookie: applicantCookie },
      body: multipart,
    });
    assert.equal(submission.status, 201);
    assert.equal(submitted.linkedinUrl, "https://linkedin.com/in/http-applicant/");
    assert.equal(submitted.audioDurationSeconds, 0);

    const exchange = await fetch(`${baseUrl}/assessment/ABCDEFGHIJKL`, { redirect: "manual" });
    assert.equal(exchange.status, 303);
    assert.equal(exchange.headers.get("location"), "/assessment");
    assert.equal(exchange.headers.get("referrer-policy"), "no-referrer");
    assert.match(exchange.headers.get("cache-control"), /no-store/);
    const reviewerCookie = exchange.headers.get("set-cookie").split(";", 1)[0];

    const unauthenticatedState = await fetch(`${baseUrl}/api/recruitment/reviewer/state`);
    assert.equal(unauthenticatedState.status, 401);

    const state = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, {
      headers: { Cookie: reviewerCookie },
    });
    const statePayload = await state.json();
    assert.equal(statePayload.authenticated, true);
    assert.equal(statePayload.current.applicationId, "application-one");
    assert.deepEqual(statePayload.history, history);
    assert.equal(statePayload.pendingTotal, 7);
    assert.equal(statePayload.processedTotal, 24);

    const created = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "2026-10",
        displayName: "October 2026",
        password: "shared",
        opensAt: "2026-10-01T00:00",
        closesAt: "2026-10-31T23:59",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).cohort.slug, "2026-10");

    const audio = await fetch(`${baseUrl}/api/recruitment/reviewer/applications/application-one/audio`, {
      headers: { Cookie: reviewerCookie, Range: "bytes=2-5" },
    });
    assert.equal(audio.status, 206);
    assert.equal(audio.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await audio.text(), "2345");

    const unconfirmed = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/next/activate`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmed.status, 400);
    const unconfirmedAlias = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/activate-next`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmedAlias.status, 400);
    const activation = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/next/activate`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(activation.status, 200);
    assert.equal(activatedId, "next");

    assert.equal(await (await fetch(`${baseUrl}/`)).text(), "<main>website-index</main>");
    assert.equal(await (await fetch(`${baseUrl}/generated/`)).text(), "<main>generated-route</main>");
    assert.equal(await (await fetch(`${baseUrl}/assets/asset.txt`)).text(), "asset-body");
    assert.equal(await (await fetch(`${baseUrl}/client-side-route`)).text(), "<main>website-index</main>");
    assert.equal(readFileSync(audioPath, "utf8"), "0123456789");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
