import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createSignedCookieCodec, REVIEWER_COOKIE_NAME } from "../server/recruitment-access.js";
import { createRecruitmentApp } from "../server/app.js";
import { createRecruitmentDatabase, RECRUITMENT_SCHEMA_VERSION } from "../server/recruitment-db.js";
import { createRecruitmentService } from "../server/recruitment-service.js";
import { createRecruitmentStorage } from "../server/recruitment-storage.js";

const NOW = new Date("2026-10-16T06:00:00.000Z");
const V1_SCHEMA = `
  CREATE TABLE recruitment_cohorts (
    cohort_id TEXT PRIMARY KEY NOT NULL, month_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, slot TEXT, opens_at TEXT NOT NULL, closes_at TEXT NOT NULL,
    password_salt BLOB NOT NULL, password_hash BLOB NOT NULL, password_parameters TEXT NOT NULL,
    created_at TEXT NOT NULL, activated_at TEXT
  ) STRICT;
  CREATE TABLE recruitment_applications (
    application_id TEXT PRIMARY KEY NOT NULL,
    cohort_id TEXT NOT NULL REFERENCES recruitment_cohorts(cohort_id) ON DELETE CASCADE,
    full_name TEXT NOT NULL, email TEXT NOT NULL, linkedin_url TEXT NOT NULL,
    audio_storage_key TEXT NOT NULL UNIQUE, audio_mime_type TEXT NOT NULL,
    audio_file_size INTEGER NOT NULL CHECK (audio_file_size > 0),
    audio_duration_seconds REAL NOT NULL CHECK (audio_duration_seconds >= 0 AND audio_duration_seconds <= 60),
    submitted_at TEXT NOT NULL, decision TEXT CHECK (decision IN ('pass', 'fail') OR decision IS NULL),
    reviewed_at TEXT, email_status TEXT NOT NULL DEFAULT 'not_attempted'
      CHECK (email_status IN ('not_attempted', 'attempting', 'sent', 'failed')),
    email_attempted_at TEXT, email_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (email_attempt_count IN (0, 1)),
    email_provider_id TEXT, email_error TEXT
  ) STRICT;
  PRAGMA user_version = 1;
`;

function createFixture({ legacy = false } = {}) {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "patch-website-team-decisions-"));
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  if (legacy) {
    const oldDatabase = new DatabaseSync(storage.databasePath);
    oldDatabase.exec(V1_SCHEMA);
    oldDatabase.close();
  }
  let rawDatabase = new DatabaseSync(storage.databasePath);
  let database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: rawDatabase });
  let deliveries = 0;
  let instant = NOW;
  const emailSender = {
    configured: true,
    createPassEmailDraft(application) {
      return { to: application.email, subject: "Stage One passed", body: `Hello ${application.fullName}` };
    },
    createTeamEmailDraft(application, decision) {
      return { to: application.email, subject: decision, body: `${application.fullName}: ${decision}` };
    },
    async sendOutcome() {
      deliveries += 1;
      throw new Error("Team outcomes must not send email");
    },
  };
  let service = createRecruitmentService({ database, storage, emailSender, now: () => instant });
  const cohort = database.createNextCohort({
    monthKey: "2026-10", displayName: "October 2026",
    opensAt: "2026-10-01T00:00:00.000Z", closesAt: "2026-11-01T00:00:00.000Z",
    passwordSalt: Buffer.from("synthetic-salt"), passwordHash: Buffer.from("synthetic-hash"),
    passwordParameters: "synthetic-only", createdAt: NOW.toISOString(),
  });
  database.activateNext(database.previewActivateNext(), NOW.toISOString());

  function createApplication(decision = "pending", label = decision) {
    const stored = storage.storeAudio("2026-10", Buffer.from(`synthetic-private-audio-${label}`), "audio/webm");
    let application = database.createApplication({
      cohortId: cohort.cohortId,
      fullName: `Synthetic ${label}`,
      email: "synthetic@example.com",
      linkedinUrl: "https://example.com/synthetic",
      audioStorageKey: stored.storageKey, audioMimeType: stored.mimeType,
      audioFileSize: stored.fileSize, audioDurationSeconds: 1, submittedAt: NOW.toISOString(),
    });
    if (decision !== "pending") {
      database.decideApplication(application.applicationId, decision, NOW.toISOString());
      application = database.recordEmailResult(application.applicationId, {
        ok: decision === "pass", providerId: "synthetic-original-provider", error: "synthetic-original-error",
      });
    }
    return { ...application, filePath: stored.filePath };
  }

  return {
    dataRoot, storage, cohort, createApplication,
    get database() { return database; },
    get rawDatabase() { return rawDatabase; },
    get service() { return service; },
    deliveries: () => deliveries,
    setNow(value) { instant = new Date(value); },
    reopen() {
      database.close();
      rawDatabase = new DatabaseSync(storage.databasePath);
      database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: rawDatabase });
      service = createRecruitmentService({ database, storage, emailSender, now: () => instant });
    },
    close() {
      database.close();
      rmSync(dataRoot, { recursive: true, force: true });
    },
  };
}

test("schema v1 upgrade is additive and preserves existing records, outcomes, emails and audio", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "patch-website-team-upgrade-"));
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const oldDatabase = new DatabaseSync(storage.databasePath);
  oldDatabase.exec(V1_SCHEMA);
  oldDatabase.prepare(`INSERT INTO recruitment_cohorts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("synthetic-window", "2026-10", "October 2026", "current", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z", Buffer.from("salt"), Buffer.from("hash"), "synthetic", NOW.toISOString(), NOW.toISOString());
  const before = [];
  const files = [];
  for (const decision of [null, "pass", "fail"]) {
    const stored = storage.storeAudio("2026-10", Buffer.from(`synthetic-migrated-audio-${decision}`), "audio/webm");
    files.push(stored.filePath);
    oldDatabase.prepare(`INSERT INTO recruitment_applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`synthetic-${decision}`, "synthetic-window", `Synthetic ${decision}`, "synthetic@example.com", "https://example.com/profile", stored.storageKey, stored.mimeType, stored.fileSize, 1, NOW.toISOString(), decision, decision ? NOW.toISOString() : null, decision === "fail" ? "failed" : decision ? "sent" : "not_attempted", decision ? NOW.toISOString() : null, decision ? 1 : 0, decision ? "original-provider" : null, decision === "fail" ? "original-error" : null);
  }
  before.push(...oldDatabase.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all());
  oldDatabase.close();
  const raw = new DatabaseSync(storage.databasePath);
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath, database: raw });
  try {
    assert.equal(RECRUITMENT_SCHEMA_VERSION, 2);
    assert.deepEqual(database.healthCheck(), { ok: true, schemaVersion: 2 });
    const migrated = raw.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all();
    migrated.forEach((row, index) => {
      const { team_decision, team_decided_at, ...original } = row;
      assert.deepEqual(original, { ...before[index] });
      assert.equal(team_decision, "");
      assert.equal(team_decided_at, null);
      const application = database.getApplication(row.application_id);
      assert.equal(application.teamDecision, "");
      assert.equal(application.teamDecidedAt, "");
    });
    for (const file of files) assert.match(readFileSync(file, "utf8"), /^synthetic-migrated-audio-/);
    assert.deepEqual(database.listAudioStorageKeys().sort(), before.map((row) => row.audio_storage_key).sort());
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("only passed, unfinalized cards expose both personalised team email drafts", () => {
  const f = createFixture();
  try {
    f.createApplication("pending");
    const passed = f.createApplication("pass");
    const failed = f.createApplication("fail");
    assert.equal(f.service.listPendingApplications()[0].teamEmailDrafts, undefined);
    const history = f.service.listProcessedApplications();
    const passCard = history.find((card) => card.applicationId === passed.applicationId);
    assert.equal(passCard.teamDecision, "");
    assert.equal(passCard.teamDecidedAt, "");
    assert.deepEqual(passCard.teamEmailDrafts, {
      rejected: { to: passed.email, subject: "rejected", body: `${passed.fullName}: rejected` },
      invited: { to: passed.email, subject: "invited", body: `${passed.fullName}: invited` },
    });
    assert.equal(history.find((card) => card.applicationId === failed.applicationId).teamEmailDrafts, undefined);
    assert.equal(f.database.getApplication(passed.applicationId).teamDecision, "", "reading drafts cannot move a card");
    assert.equal(f.deliveries(), 0);
  } finally { f.close(); }
});

test("team decisions require an exact Confirm Sent and valid outcome without changing Stage One metadata", () => {
  const f = createFixture();
  try {
    const passed = f.createApplication("pass");
    const before = f.database.getApplication(passed.applicationId);
    for (const confirmSent of [undefined, false, null, "true", 1, {}, []]) {
      assert.throws(() => f.service.decideTeamApplication(passed.applicationId, "invited", confirmSent), (error) => error.code === "team_decision_confirmation_required" && error.statusCode === 400);
      assert.deepEqual(f.database.getApplication(passed.applicationId), before);
    }
    for (const decision of [undefined, null, "pass", "fail", "Invite", "invited ", 1, {}, ["invited"]]) {
      assert.throws(() => f.service.decideTeamApplication(passed.applicationId, decision, true), (error) => error.code === "invalid_team_decision" && error.statusCode === 400);
      assert.deepEqual(f.database.getApplication(passed.applicationId), before);
    }
    for (const stage of ["pending", "fail"]) {
      const other = f.createApplication(stage);
      assert.throws(() => f.service.decideTeamApplication(other.applicationId, "rejected", true), (error) => error.code === "team_decision_requires_pass" && error.statusCode === 409);
      assert.equal(f.database.getApplication(other.applicationId).teamDecision, "");
    }
    assert.throws(() => f.service.decideTeamApplication("does-not-exist", "invited", true), (error) => error.code === "application_missing" && error.statusCode === 404);
    f.setNow("2026-10-16T07:00:00.000Z");
    const result = f.service.decideTeamApplication(passed.applicationId, "invited", true);
    assert.equal(result.application.teamDecision, "invited");
    assert.equal(result.application.teamDecidedAt, "2026-10-16T07:00:00.000Z");
    assert.equal(result.application.teamEmailDrafts, undefined);
    const { teamDecision, teamDecidedAt, ...preserved } = f.database.getApplication(passed.applicationId);
    const { teamDecision: _oldDecision, teamDecidedAt: _oldTime, ...original } = before;
    assert.deepEqual(preserved, original);
    assert.equal(f.deliveries(), 0);
  } finally { f.close(); }
});

test("both final outcomes survive reopening, are idempotent, and cannot be reversed or emailed twice", () => {
  const f = createFixture();
  try {
    const records = [f.createApplication("pass", "invited"), f.createApplication("pass", "rejected")];
    records.forEach((record, index) => f.service.decideTeamApplication(record.applicationId, ["invited", "rejected"][index], true));
    f.reopen();
    records.forEach((record, index) => {
      const decision = ["invited", "rejected"][index];
      const saved = f.database.getApplication(record.applicationId);
      assert.equal(saved.teamDecision, decision);
      assert.equal(saved.teamDecidedAt, NOW.toISOString());
      f.setNow("2026-10-17T08:00:00.000Z");
      assert.deepEqual(f.service.decideTeamApplication(record.applicationId, decision, true).application,
        f.service.listProcessedApplications().find((card) => card.applicationId === record.applicationId));
      assert.equal(f.database.getApplication(record.applicationId).teamDecidedAt, NOW.toISOString());
      assert.throws(() => f.service.decideTeamApplication(record.applicationId, decision === "invited" ? "rejected" : "invited", true), (error) => error.code === "application_team_decision_conflict" && error.statusCode === 409);
      assert.equal(f.service.listProcessedApplications().find((card) => card.applicationId === record.applicationId).teamEmailDrafts, undefined);
      assert.equal(existsSync(record.filePath), true);
    });
    assert.equal(f.deliveries(), 0);
  } finally { f.close(); }
});

test("team changes invalidate a stale Remove snapshot and a fresh Remove clears all outcome state and audio", () => {
  const f = createFixture();
  try {
    const passed = f.createApplication("pass");
    const invited = f.createApplication("pass", "invited");
    f.createApplication("pending");
    f.createApplication("fail");
    const stale = f.database.previewDeleteCurrentCohort(f.cohort.cohortId);
    f.service.decideTeamApplication(passed.applicationId, "rejected", true);
    assert.throws(() => f.database.deleteCurrentCohort(stale), (error) => error.code === "cohort_delete_conflict" && error.statusCode === 409);
    f.service.decideTeamApplication(invited.applicationId, "invited", true);
    const removed = f.service.deleteCurrentCohort(f.cohort.cohortId);
    assert.equal(removed.deletedApplicationCount, 4);
    assert.equal(removed.deletedAudioCount, 4);
    assert.equal(removed.deletionComplete, true);
    assert.equal(f.database.getApplication(passed.applicationId), null);
    assert.equal(f.database.getApplication(invited.applicationId), null);
    assert.deepEqual(f.service.listProcessedApplications(), []);
    assert.deepEqual(f.service.listPendingApplications(), []);
    assert.deepEqual(f.database.listAudioStorageKeys(), []);
    assert.equal(existsSync(passed.filePath), false);
    assert.equal(existsSync(invited.filePath), false);
    assert.equal(f.deliveries(), 0);
    f.reopen();
    assert.deepEqual(f.service.listProcessedApplications(), []);
  } finally { f.close(); }
});

test("team-decision HTTP requires reviewer auth, JSON, same origin and confirmation; competing outcomes cannot both win", async () => {
  const f = createFixture();
  const codec = createSignedCookieCodec("synthetic-team-decision-cookie-secret-at-least-32-bytes");
  const cookie = `${REVIEWER_COOKIE_NAME}=${codec.seal({ v: 1, kind: "reviewer", exp: Math.floor(NOW.getTime() / 1000) + 600 })}`;
  const app = await createRecruitmentApp({
    service: f.service, cookieCodec: codec, reviewerSecret: "SYNTHETICTEAM123", secureCookies: false,
    reviewerNow: () => NOW.getTime(),
  });
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const passed = f.createApplication("pass");
  const url = `${base}/api/recruitment/reviewer/applications/${passed.applicationId}/team-decision`;
  const headers = { Cookie: cookie, "Content-Type": "application/json", Origin: base };
  const post = (body = { decision: "invited", confirmSent: true }, requestHeaders = headers) => fetch(url, { method: "POST", headers: requestHeaders, body: JSON.stringify(body) });
  try {
    const anonymous = await post(undefined, { "Content-Type": "application/json", Origin: base });
    assert.equal(anonymous.status, 401);
    const expired = `${REVIEWER_COOKIE_NAME}=${codec.seal({ v: 1, kind: "reviewer", exp: Math.floor(NOW.getTime() / 1000) - 1 })}`;
    assert.equal((await post(undefined, { ...headers, Cookie: expired })).status, 401);
    assert.equal((await post(undefined, { ...headers, "Content-Type": "text/plain" })).status, 415);
    for (const requestHeaders of [
      { Cookie: cookie, "Content-Type": "application/json" },
      { ...headers, Origin: "https://attacker.example" },
      { ...headers, Origin: base.replace("http:", "https:") },
      { ...headers, "Sec-Fetch-Site": "cross-site" },
      { ...headers, "Sec-Fetch-Site": "same-site" },
      { ...headers, "Sec-Fetch-Site": "none" },
    ]) {
      const denied = await post(undefined, requestHeaders);
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).code, "team_decision_origin");
    }
    assert.equal((await post({ decision: "invited" })).status, 400);
    assert.equal((await post({ decision: "pass", confirmSent: true })).status, 400);
    assert.equal(f.database.getApplication(passed.applicationId).teamDecision, "");
    assert.equal(f.deliveries(), 0);

    const results = await Promise.all([
      post({ decision: "invited", confirmSent: true }, { ...headers, "Sec-Fetch-Site": "same-origin" }),
      post({ decision: "rejected", confirmSent: true }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const recorded = f.database.getApplication(passed.applicationId);
    assert.ok(["invited", "rejected"].includes(recorded.teamDecision));
    const retry = await post({ decision: recorded.teamDecision, confirmSent: true });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).application.teamDecidedAt, recorded.teamDecidedAt);
    const history = await fetch(`${base}/api/recruitment/reviewer/state`, { headers: { Cookie: cookie } });
    const state = await history.json();
    assert.equal(state.history[0].teamDecision, recorded.teamDecision);
    assert.equal(state.history[0].teamEmailDrafts, undefined);
    assert.equal(f.deliveries(), 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    f.close();
  }
});

test("team confirmation accepts the public HTTPS origin behind TLS termination, without trusting a foreign origin", async () => {
  const f = createFixture();
  const codec = createSignedCookieCodec("synthetic-team-proxy-cookie-secret-at-least-32-bytes");
  const cookie = `${REVIEWER_COOKIE_NAME}=${codec.seal({ v: 1, kind: "reviewer", exp: Math.floor(NOW.getTime() / 1000) + 600 })}`;
  const app = await createRecruitmentApp({
    service: f.service, cookieCodec: codec, reviewerSecret: "SYNTHETICTEAM123", secureCookies: true,
    reviewerNow: () => NOW.getTime(),
  });
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve(listening));
  });
  const passed = f.createApplication("pass");
  const url = `http://127.0.0.1:${server.address().port}/api/recruitment/reviewer/applications/${passed.applicationId}/team-decision`;
  const headers = {
    Cookie: cookie, "Content-Type": "application/json", Host: "www.patch.app",
    Origin: "https://www.patch.app", "Sec-Fetch-Site": "same-origin",
  };
  // Node's fetch replaces Host with the loopback destination. Use the HTTP
  // client here so the fixture accurately represents Railway TLS termination.
  const post = (origin = headers.Origin) => new Promise((resolve, reject) => {
    const req = request(url, { method: "POST", headers: { ...headers, Origin: origin } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, payload: JSON.parse(body) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(JSON.stringify({ decision: "invited", confirmSent: true }));
  });
  try {
    for (const origin of ["http://www.patch.app", "https://other.example", "https://www.patch.app.evil.example"]) {
      const response = await post(origin);
      assert.equal(response.status, 403);
      assert.equal(f.database.getApplication(passed.applicationId).teamDecision, "");
    }
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal(response.payload.application.teamDecision, "invited");
    assert.equal(f.deliveries(), 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    f.close();
  }
});
