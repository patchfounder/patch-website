import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  APPLICANT_COOKIE_NAME,
  REVIEWER_COOKIE_NAME,
  cohortWindowState,
  createSignedCookieCodec,
  hashCohortPassword,
  verifyCohortPassword,
} from "../server/recruitment-access.js";
import { createRecruitmentApp } from "../server/app.js";
import { createRecruitmentDatabase } from "../server/recruitment-db.js";
import { createRecruitmentService } from "../server/recruitment-service.js";
import { createRecruitmentStorage } from "../server/recruitment-storage.js";

const INITIAL_PASSWORD = "synthetic-original-password";
const OPENED = "2026-10-03T00:00:00.000Z";
const CLOSED = "2026-11-01T00:00:00.000Z";
const EMAIL = {
  configured: true,
  async sendOutcome() { throw new Error("Ongoing tests must not send email"); },
};

async function fixture({ migrate = false } = {}) {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "patch-website-ongoing-"));
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  let raw = new DatabaseSync(storage.databasePath);
  let database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: raw });
  const password = await hashCohortPassword(INITIAL_PASSWORD);
  const previous = database.createNextCohort({
    monthKey: "2026-09", displayName: "September 2026", opensAt: "2026-09-01T00:00:00.000Z",
    closesAt: "2026-10-01T00:00:00.000Z", passwordSalt: password.salt,
    passwordHash: password.hash, passwordParameters: password.parameters, createdAt: OPENED,
  });
  database.activateNext(database.previewActivateNext(), OPENED);
  const current = database.createNextCohort({
    monthKey: "2026-10", displayName: "October 2026", opensAt: OPENED,
    closesAt: CLOSED, passwordSalt: password.salt,
    passwordHash: password.hash, passwordParameters: password.parameters, createdAt: OPENED,
  });
  database.activateNext(database.previewActivateNext(), OPENED);
  const files = [];
  for (const [index, decision] of ["pending", "pass", "fail", "rejected", "invited"].entries()) {
    const cohort = index === 2 ? previous : current;
    const file = storage.storeAudio(cohort.monthKey, Buffer.from(`synthetic-private-${decision}`), "audio/webm");
    files.push(file);
    const application = database.createApplication({
      cohortId: cohort.cohortId, fullName: `Synthetic ${decision}`, email: "synthetic@example.com",
      linkedinUrl: "https://example.com/synthetic", audioStorageKey: file.storageKey,
      audioMimeType: file.mimeType, audioFileSize: file.fileSize, audioDurationSeconds: 1,
      submittedAt: OPENED,
    });
    if (decision !== "pending") {
      database.decideApplication(application.applicationId, decision === "fail" ? "fail" : "pass", OPENED);
      database.recordEmailResult(application.applicationId, { ok: true, providerId: "synthetic-provider" });
      if (["rejected", "invited"].includes(decision)) {
        database.decideTeamApplication(application.applicationId, decision, OPENED);
      }
    }
  }
  const prepared = database.createNextCohort({
    monthKey: "2026-11", displayName: "November 2026", opensAt: CLOSED,
    closesAt: "2026-12-01T00:00:00.000Z", passwordSalt: password.salt,
    passwordHash: password.hash, passwordParameters: password.parameters, createdAt: OPENED,
  });
  const originalCohorts = raw.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all();
  const originalApplications = raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all();
  if (migrate) {
    raw.exec("ALTER TABLE recruitment_cohorts DROP COLUMN always_open; ALTER TABLE recruitment_cohorts DROP COLUMN password_revision; PRAGMA user_version = 2;");
    database.close();
    raw = new DatabaseSync(storage.databasePath);
    database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: raw });
  } else {
    raw.prepare("UPDATE recruitment_cohorts SET always_open = 1 WHERE cohort_id = ?").run(current.cohortId);
  }
  let instant = new Date("2030-02-01T12:00:00.000Z");
  const makeService = (overrides = {}) => createRecruitmentService({
    database, storage, emailSender: EMAIL, now: () => instant, ...overrides,
  });
  let service = makeService();
  return {
    dataRoot, storage, previous, current, prepared, files, originalCohorts, originalApplications,
    get database() { return database; },
    get raw() { return raw; },
    get service() { return service; },
    makeService,
    reopen() {
      database.close();
      raw = new DatabaseSync(storage.databasePath);
      database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: raw });
      service = makeService();
    },
    now() { return instant; },
    setNow(value) { instant = new Date(value); },
    submit(service, sessionPayload) {
      return service.submitApplication({
        sessionPayload, fullName: "Synthetic Future Applicant", email: "future@example.com",
        linkedinUrl: "https://example.com/future", audioDurationSeconds: 0,
        audioBuffer: Buffer.from("synthetic future voice"), audioMimeType: "audio/webm",
      });
    },
    close() { database.close(); rmSync(dataRoot, { recursive: true, force: true }); },
  };
}

test("schema 3 converts only the existing current intake in place and preserves every card and audio", async () => {
  const f = await fixture({ migrate: true });
  try {
    assert.deepEqual(f.database.healthCheck(), { ok: true, schemaVersion: 3 });
    const migrated = f.raw.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all();
    migrated.forEach((row, index) => {
      const { always_open, password_revision, ...preserved } = row;
      const { always_open: _oldFlag, password_revision: _oldRevision, ...original } = f.originalCohorts[index];
      assert.deepEqual(preserved, original);
      assert.equal(always_open, row.slot === "current" ? 1 : 0);
      assert.equal(password_revision, 0);
    });
    assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(), f.originalApplications);
    f.files.forEach((file) => assert.match(readFileSync(file.filePath, "utf8"), /^synthetic-private-/));
    assert.equal(f.database.getCohortBySlot("previous").alwaysOpen, false);
    assert.equal(f.database.getCohortBySlot("next").alwaysOpen, false);
    assert.equal(cohortWindowState(f.database.getCohortBySlot("previous"), f.now()), "closed");
    const cohort = f.service.getApplicantStatus().cohort;
    assert.equal(cohort.alwaysOpen, true);
    assert.equal(cohort.opensAt, OPENED);
    assert.equal(cohort.closesAt, CLOSED, "historical dates are preserved, not rewritten to far-future placeholders");
    assert.equal(cohort.displayName, "October 2026");
    assert.equal(cohort.passwordRevision, 0);
    assert.equal(Object.hasOwn(cohort, "passwordHash"), false);
    assert.equal(Object.hasOwn(cohort, "passwordSalt"), false);
    assert.equal(f.service.listPendingApplications().length, 1);
    assert.equal(f.service.listProcessedApplications().length, 4);
    for (let reopening = 0; reopening < 2; reopening += 1) {
      f.reopen();
      assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all(), migrated, "migration is idempotent");
      assert.equal(f.database.getCohortBySlot("current").cohortId, f.current.cohortId);
      assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(), f.originalApplications);
      f.files.forEach((file) => assert.match(readFileSync(file.filePath, "utf8"), /^synthetic-private-/));
    }
  } finally { f.close(); }
});

test("ongoing intake permits login and submission in 2030 and 2100 with independent 24-hour sessions", async () => {
  const f = await fixture();
  try {
    for (const date of ["2030-02-01T12:00:00.000Z", "2100-06-15T09:00:00.000Z"]) {
      f.setNow(date);
      assert.equal(f.service.getApplicantStatus().state, "open");
      const login = await f.service.unlockApplicant(INITIAL_PASSWORD);
      assert.equal(login.expiresAt.getTime() - f.now().getTime(), 86_400_000);
      assert.equal(login.sessionPayload.passwordRevision, 0);
      const submitted = f.submit(f.service, login.sessionPayload);
      assert.equal(f.database.getApplication(submitted.application.applicationId).cohortId, f.current.cohortId);
      f.setNow(login.expiresAt);
      assert.throws(() => f.service.validateApplicantSession(login.sessionPayload), { code: "applicant_session_expired" });
      const nextLogin = await f.service.unlockApplicant(INITIAL_PASSWORD);
      assert.equal(nextLogin.cohort.cohortId, f.current.cohortId);
    }
    assert.equal(cohortWindowState({ alwaysOpen: true, opensAt: OPENED, closesAt: CLOSED }, new Date("2026-01-01")), "open");
  } finally { f.close(); }
});

test("password rotation preserves intake and outcomes while invalidating only prior applicant revisions", async () => {
  const f = await fixture();
  try {
    const login = await f.service.unlockApplicant(INITIAL_PASSWORD);
    const legacy = { ...login.sessionPayload };
    delete legacy.passwordRevision;
    assert.ok(f.service.validateApplicantSession(legacy));
    const codec = createSignedCookieCodec("synthetic-legacy-applicant-cookie-secret-at-least-32-bytes");
    const oldSignedPayload = codec.unseal(codec.seal(legacy));
    assert.ok(f.service.validateApplicantSession(oldSignedPayload));
    for (const revision of [null, "0", -1, 0.5, 1]) {
      assert.throws(() => f.service.validateApplicantSession({ ...legacy, passwordRevision: revision }), { code: "applicant_session_expired" });
    }
    const before = f.database.getCohortBySlot("current");
    const changed = await f.service.changeApplicantPassword({
      cohortId: before.cohortId, expectedRevision: 0, password: "synthetic-new-password",
    });
    assert.equal(changed.currentCohort.passwordRevision, 1);
    for (const payload of [legacy, oldSignedPayload, login.sessionPayload]) {
      assert.equal(f.service.getApplicantStatus(payload).unlocked, false);
      assert.throws(() => f.submit(f.service, payload), { code: "applicant_session_expired" });
    }
    await assert.rejects(f.service.unlockApplicant(INITIAL_PASSWORD), { code: "invalid_cohort_password" });
    const next = await f.service.unlockApplicant("synthetic-new-password");
    assert.equal(next.sessionPayload.passwordRevision, 1);
    assert.ok(f.service.validateApplicantSession(next.sessionPayload));
    assert.equal(f.service.getApplicantStatus(next.sessionPayload).unlocked, true);
    const after = f.database.getCohortBySlot("current");
    for (const field of ["cohortId", "opensAt", "closesAt", "createdAt", "activatedAt", "monthKey", "displayName", "applicationCount"]) {
      assert.equal(after[field], before[field]);
    }
    assert.notDeepEqual(after.passwordSalt, before.passwordSalt);
    assert.equal(await verifyCohortPassword("synthetic-new-password", after), true);
    assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(), f.originalApplications);
    assert.equal(JSON.stringify(changed).includes("synthetic-new-password"), false);
  } finally { f.close(); }
});

test("invalid and stale password updates never write; concurrent changes use a revision compare-and-swap", async () => {
  const f = await fixture();
  try {
    const before = f.raw.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all();
    for (const input of [
      {}, { cohortId: f.current.cohortId, expectedRevision: "0", password: "x" },
      { cohortId: f.current.cohortId, expectedRevision: -1, password: "x" },
      { cohortId: f.current.cohortId, expectedRevision: 0, password: [] },
      { cohortId: f.current.cohortId, expectedRevision: 0, password: " " },
      { cohortId: f.current.cohortId, expectedRevision: 0, password: "x".repeat(257) },
      { cohortId: f.previous.cohortId, expectedRevision: 0, password: "x" },
      { cohortId: f.current.cohortId, expectedRevision: 1, password: "x" },
    ]) await assert.rejects(f.service.changeApplicantPassword(input));
    assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all(), before);
    const results = await Promise.allSettled(["one", "two"].map((label) => f.service.changeApplicantPassword({
      cohortId: f.current.cohortId, expectedRevision: 0, password: `synthetic-concurrent-${label}`,
    })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "applicant_password_conflict").length, 1);
    assert.equal(f.database.getCohortBySlot("current").passwordRevision, 1);
    const successIndex = results.findIndex((result) => result.status === "fulfilled");
    await f.service.unlockApplicant(`synthetic-concurrent-${successIndex === 0 ? "one" : "two"}`);
  } finally { f.close(); }
});

test("login verification and audio persistence recheck the password revision against concurrent rotation", async () => {
  const f = await fixture();
  try {
    const newHash = await hashCohortPassword("synthetic-race-password");
    const pendingLogin = f.service.unlockApplicant(INITIAL_PASSWORD);
    f.database.changeApplicantPassword({
      cohortId: f.current.cohortId, expectedRevision: 0,
      passwordSalt: newHash.salt, passwordHash: newHash.hash, passwordParameters: newHash.parameters,
    });
    await assert.rejects(pendingLogin, { code: "cohort_not_open" });
    const session = await f.service.unlockApplicant("synthetic-race-password");
    const beforeAudio = f.database.listAudioStorageKeys();
    let storedFile;
    const raceService = f.makeService({ storage: {
      ...f.storage,
      storeAudio(...args) {
        storedFile = f.storage.storeAudio(...args);
        f.database.changeApplicantPassword({
          cohortId: f.current.cohortId, expectedRevision: 1,
          passwordSalt: newHash.salt, passwordHash: newHash.hash, passwordParameters: newHash.parameters,
        });
        return storedFile;
      },
    } });
    assert.throws(() => f.submit(raceService, session.sessionPayload), { code: "applicant_session_expired" });
    assert.deepEqual(f.database.listAudioStorageKeys(), beforeAudio);
    assert.equal(existsSync(storedFile.filePath), false, "a stale submission leaves no private orphan audio");
  } finally { f.close(); }
});

test("legacy window mutations are disabled for ongoing recruitment before any private storage change", async () => {
  const f = await fixture();
  try {
    const controls = { password: "x", opensAt: OPENED, closesAt: CLOSED };
    for (const operation of [() => f.service.createNextCohort(controls), () => f.service.createAndActivateCohort(controls)]) {
      await assert.rejects(operation(), { code: "ongoing_recruitment_window_disabled" });
    }
    for (const operation of [
      () => f.service.activateNextCohort(), () => f.service.deleteCurrentCohort(f.current.cohortId),
      () => f.database.createNextCohort({}), () => f.database.previewCreateAndActivate("2030-01"),
      () => f.database.createAndActivateCohort({}, {}), () => f.database.previewActivateNext(),
      () => f.database.activateNext({}, OPENED), () => f.database.previewDeleteCurrentCohort(f.current.cohortId),
      () => f.database.deleteCurrentCohort({}),
    ]) assert.throws(operation, { code: "ongoing_recruitment_window_disabled" });
    assert.equal(f.database.getCohortBySlot("current").cohortId, f.current.cohortId);
    assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(), f.originalApplications);
    f.files.forEach((file) => assert.equal(existsSync(file.filePath), true));
  } finally { f.close(); }
});

test("password HTTP update requires reviewer, JSON and same origin and leaves reviewer sessions unchanged", async () => {
  const f = await fixture();
  let server;
  const codec = createSignedCookieCodec("synthetic-ongoing-cookie-secret-at-least-32-bytes");
  try {
    const app = await createRecruitmentApp({
      service: f.service, cookieCodec: codec, reviewerSecret: "ONGOING12345",
      secureCookies: false, reviewerNow: () => f.now().getTime(),
      audioInspector: async () => ({ durationSeconds: 0 }),
    });
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve(instance));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const passwordUrl = `${origin}/api/recruitment/reviewer/password`;
    const reviewer = `${REVIEWER_COOKIE_NAME}=${codec.seal({ v: 1, kind: "reviewer", exp: Math.floor(f.now().getTime() / 1000) + 1200 })}`;
    const login = await f.service.unlockApplicant(INITIAL_PASSWORD);
    const applicant = `${APPLICANT_COOKIE_NAME}=${codec.seal(login.sessionPayload)}`;
    const body = JSON.stringify({ cohortId: f.current.cohortId, expectedRevision: 0, password: "synthetic-http-new-password" });
    const request = (headers, value = body) => fetch(passwordUrl, { method: "PUT", headers, body: value });
    for (const cookie of [undefined, applicant]) {
      const response = await request({ "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) });
      assert.equal(response.status, 401);
    }
    assert.equal((await request({ Cookie: reviewer, Origin: origin, "Content-Type": "text/plain" })).status, 415);
    for (const headers of [
      {}, { Origin: "https://external.example" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" },
    ]) {
      assert.equal((await request({ Cookie: reviewer, "Content-Type": "application/json", ...headers })).status, 403);
    }
    assert.equal(f.database.getCohortBySlot("current").passwordRevision, 0);
    const changed = await request({ Cookie: reviewer, "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin" });
    assert.equal(changed.status, 200);
    assert.equal(changed.headers.get("set-cookie"), null, "password update must not change reviewer cookies");
    assert.match(changed.headers.get("cache-control"), /no-store/);
    const json = await changed.json();
    assert.equal(json.currentCohort.passwordRevision, 1);
    assert.equal(JSON.stringify(json).includes("synthetic-http-new-password"), false);
    const reviewerState = await fetch(`${origin}/api/recruitment/reviewer/state`, { headers: { Cookie: reviewer } });
    assert.equal(reviewerState.status, 200);
    for (const [method, url, value] of [
      ["POST", "/api/recruitment/reviewer/cohorts", { password: "synthetic-stale-password", opensAt: OPENED, closesAt: CLOSED }],
      ["POST", "/api/recruitment/reviewer/cohorts/next", { password: "synthetic-stale-password", opensAt: OPENED, closesAt: CLOSED }],
      ["POST", "/api/recruitment/reviewer/cohorts/activate-next", { confirm: true }],
      ["POST", `/api/recruitment/reviewer/cohorts/${f.prepared.cohortId}/activate`, { confirm: true }],
      ["DELETE", `/api/recruitment/reviewer/cohorts/${f.current.cohortId}`, { confirm: true }],
    ]) {
      const response = await fetch(`${origin}${url}`, { method, headers: { Cookie: reviewer, "Content-Type": "application/json" }, body: JSON.stringify(value) });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "ongoing_recruitment_window_disabled");
    }
    assert.deepEqual(f.raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(), f.originalApplications);
    const stale = await fetch(`${origin}/api/recruitment/status`, { headers: { Cookie: applicant } });
    assert.equal((await stale.json()).unlocked, false);
    assert.match(stale.headers.get("set-cookie"), /Max-Age=0/);
    const freshLogin = await fetch(`${origin}/api/recruitment/unlock`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "synthetic-http-new-password" }),
    });
    assert.equal(freshLogin.status, 200);
    const freshCookie = freshLogin.headers.get("set-cookie").split(";", 1)[0];
    const freshStatus = await fetch(`${origin}/api/recruitment/status`, { headers: { Cookie: freshCookie } });
    assert.equal((await freshStatus.json()).unlocked, true);
    const form = new FormData();
    form.set("fullName", "Synthetic HTTP Applicant"); form.set("email", "http@example.com");
    form.set("linkedinUrl", "https://example.com/http"); form.set("audio", new Blob(["synthetic voice"], { type: "audio/webm" }), "synthetic.webm");
    const submitted = await fetch(`${origin}/api/recruitment/applications`, { method: "POST", headers: { Cookie: freshCookie }, body: form });
    assert.equal(submitted.status, 201);
    assert.equal((await request({ Cookie: reviewer, "Content-Type": "application/json", Origin: origin })).status, 409);
    assert.equal((await fetch(`${origin}/api/recruitment/reviewer/state`, { headers: { Cookie: reviewer } })).status, 200);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    f.close();
  }
});
