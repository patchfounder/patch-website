import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createRecruitmentRuntime } from "../server/app.js";
import { APPLICANT_COOKIE_NAME, REVIEWER_COOKIE_NAME, createSignedCookieCodec } from "../server/recruitment-access.js";
import { createRecruitmentStorage } from "../server/recruitment-storage.js";

const TOKEN = "synthetic_read_token_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const COOKIE_SECRET = "synthetic-monitor-cookie-secret-at-least-32-bytes";
const REVIEWER_SECRET = "SYNTHREVIEW1";
const BASE = "/api/recruitment/monitor/applications";
const SUBMITTED = "2026-10-03T12:00:00.000Z";
const REVIEWED = "2026-10-03T13:00:00.000Z";
const LIST_FIELDS = [
  "applicationId", "cohortId", "cohortMonth", "fullName", "linkedinUrl", "submittedAt",
  "decision", "reviewedAt", "teamDecision", "teamDecidedAt", "emailStatus", "emailAttemptedAt",
  "emailAttemptCount", "audioDurationSeconds", "audioMimeType", "audioFileSize", "reviewPath",
].sort();

function countStatuses(records) {
  return {
    total: records.length,
    pending: records.filter((record) => record.decision === "pending").length,
    pass: records.filter((record) => record.decision === "pass").length,
    fail: records.filter((record) => record.decision === "fail").length,
    invited: records.filter((record) => record.teamDecision === "invited").length,
    rejected: records.filter((record) => record.teamDecision === "rejected").length,
    emailFailed: records.filter((record) => record.emailStatus === "failed").length,
  };
}

function matchesStatus(record, status) {
  return status === "all" || record.decision === status || record.teamDecision === status;
}

function sortedRecords(records) {
  return records.slice().sort((left, right) => (
    left.submittedAt.localeCompare(right.submittedAt) || left.applicationId.localeCompare(right.applicationId)
  ));
}

function privateFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return privateFiles(filename);
    const stats = statSync(filename);
    return [{
      filename,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      mode: stats.mode,
      hash: createHash("sha256").update(readFileSync(filename)).digest("hex"),
    }];
  }).sort((left, right) => left.filename.localeCompare(right.filename));
}

async function fixture({ token = TOKEN, seed = true } = {}) {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "patch-website-monitor-"));
  const actualStorage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  const forbiddenCalls = [];
  let guardReads = false;
  const writeMethods = new Set([
    "initialize", "recoverInterruptedOperations", "storeAudio", "removeAudio", "healthCheck",
    "quarantineAudio", "quarantineCohorts", "commitQuarantine", "rollbackQuarantine",
  ]);
  const storage = Object.fromEntries(Object.entries(actualStorage).map(([key, value]) => [
    key,
    typeof value !== "function" || !writeMethods.has(key) ? value : (...args) => {
        if (guardReads) {
          forbiddenCalls.push(String(key));
          assert.fail(`A monitoring read called storage.${String(key)}`);
        }
        return value(...args);
      },
  ]));
  let runtime;
  let server;
  let reader;
  const records = [];
  const files = new Map();
  const emailSender = {
    configured: true,
    createPassEmailDraft() { forbiddenCalls.push("createPassEmailDraft"); assert.fail("Monitoring must not generate email drafts"); },
    createTeamEmailDraft() { forbiddenCalls.push("createTeamEmailDraft"); assert.fail("Monitoring must not generate email drafts"); },
    async sendOutcome() { forbiddenCalls.push("sendOutcome"); assert.fail("Monitoring must never send email"); },
  };
  try {
    runtime = await createRecruitmentRuntime({
      env: {
        NODE_ENV: "test",
        RECRUITMENT_COOKIE_SECRET: COOKIE_SECRET,
        RECRUITMENT_REVIEWER_SECRET: REVIEWER_SECRET,
        ...(token === undefined || token === null ? {} : { RECRUITMENT_MONITOR_READ_TOKEN: token }),
      },
      dataRoot,
      storage,
      emailSender,
      secureCookies: false,
    });
    const { database } = runtime;
    function addCohort(monthKey) {
      const cohort = database.createNextCohort({
        monthKey, displayName: monthKey,
        opensAt: `${monthKey}-01T00:00:00.000Z`, closesAt: `${monthKey}-28T23:59:00.000Z`,
        passwordSalt: Buffer.alloc(16, 1), passwordHash: Buffer.alloc(64, 2),
        passwordParameters: "synthetic-test-only", createdAt: SUBMITTED,
      });
      database.activateNext(database.previewActivateNext(), SUBMITTED);
      return cohort;
    }
    function addApplication(cohort, label, { decision = "pending", submittedAt = SUBMITTED, emailFailed = false } = {}) {
      const bytes = Buffer.from(`synthetic-private-audio-${label}-0123456789`);
      const file = actualStorage.storeAudio(cohort.monthKey, bytes, "audio/webm");
      const application = database.createApplication({
        cohortId: cohort.cohortId, fullName: `Synthetic ${label}`, email: "duplicate@example.com",
        linkedinUrl: "https://example.com/synthetic-profile", audioStorageKey: file.storageKey,
        audioMimeType: file.mimeType, audioFileSize: file.fileSize, audioDurationSeconds: 12.5, submittedAt,
      });
      if (decision !== "pending") {
        database.decideApplication(application.applicationId, decision === "fail" ? "fail" : "pass", REVIEWED);
        database.recordEmailResult(application.applicationId, emailFailed
          ? { ok: false, error: "synthetic-private-provider-error" }
          : { ok: true, providerId: "synthetic-private-provider-id" });
        if (["invited", "rejected"].includes(decision)) {
          database.decideTeamApplication(application.applicationId, decision, REVIEWED);
        }
      }
      const record = database.getApplication(application.applicationId);
      records.push(record);
      files.set(record.applicationId, { ...file, bytes });
      return record;
    }
    let previous;
    let current;
    if (seed) {
      previous = addCohort("2026-09");
      addApplication(previous, "previous-pass", { decision: "pass", submittedAt: "2026-09-28T12:00:00.000Z" });
      current = addCohort("2026-10");
      for (const label of ["pending-a", "pending-b", "pending-c"]) addApplication(current, label);
      addApplication(current, "pass", { decision: "pass" });
      addApplication(current, "fail", { decision: "fail", emailFailed: true });
      addApplication(current, "invited", { decision: "invited" });
      addApplication(current, "rejected", { decision: "rejected" });
    }
    reader = new DatabaseSync(actualStorage.databasePath, { readOnly: true });
    server = await new Promise((resolve, reject) => {
      const listening = runtime.app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve(listening));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    guardReads = true;
    return {
      runtime, dataRoot, storage: actualStorage, records, files, previous, current, forbiddenCalls,
      async request(route = BASE, options = {}) {
        return fetch(`${baseUrl}${route}`, {
          ...options,
          headers: { Authorization: `Bearer ${TOKEN}`, ...options.headers },
        });
      },
      addApplication(cohort, label, options) {
        guardReads = false;
        try { return addApplication(cohort, label, options); } finally { guardReads = true; }
      },
      snapshot() {
        return {
          cohorts: reader.prepare("SELECT * FROM recruitment_cohorts ORDER BY cohort_id").all(),
          applications: reader.prepare("SELECT * FROM recruitment_applications ORDER BY application_id").all(),
          dataVersion: reader.prepare("PRAGMA data_version").get(),
          audio: privateFiles(actualStorage.audioDirectory),
          staging: privateFiles(path.join(dataRoot, ".staging")),
          trash: privateFiles(path.join(dataRoot, ".trash")),
        };
      },
      async close() {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        reader.close();
        runtime.close();
        rmSync(dataRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (server) await new Promise((resolve) => server.close(resolve));
    reader?.close();
    runtime?.close();
    rmSync(dataRoot, { recursive: true, force: true });
    throw error;
  }
}

function assertPrivateResponse(response, { cookie = false } = {}) {
  assert.match(response.headers.get("cache-control") || "", /private/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  if (!cookie) assert.equal(response.headers.get("set-cookie"), null);
}

async function jsonResponse(response, status = 200) {
  assert.equal(response.status, status);
  assertPrivateResponse(response);
  return response.json();
}

test("monitor token configuration disables absent access and rejects invalid configured secrets", async () => {
  const disabled = await fixture({ token: null });
  try {
    for (const route of [BASE, `${BASE}/${disabled.records[0].applicationId}`, `${BASE}/${disabled.records[0].applicationId}/audio`]) {
      const response = await disabled.request(route);
      const payload = await jsonResponse(response, 503);
      assert.equal(payload.ok, false);
      assert.equal(JSON.stringify(payload).includes(TOKEN), false);
    }
  } finally { await disabled.close(); }
  for (const token of ["short", `${TOKEN} space`, `${TOKEN}+invalid`]) {
    await assert.rejects(fixture({ token, seed: false }), undefined, "Invalid monitor configuration must fail closed at runtime construction");
  }
});

test("monitor endpoints accept only their dedicated bearer token without creating a session", async () => {
  const f = await fixture();
  const codec = createSignedCookieCodec(COOKIE_SECRET);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const reviewer = `${REVIEWER_COOKIE_NAME}=${codec.seal({ v: 1, kind: "reviewer", exp })}`;
  const applicant = `${APPLICANT_COOKIE_NAME}=${codec.seal({ v: 1, kind: "applicant", cohortId: f.current.cohortId, exp })}`;
  try {
    for (const route of [BASE, `${BASE}/${f.records[0].applicationId}`, `${BASE}/${f.records[0].applicationId}/audio`]) {
      for (const headers of [
        { Authorization: "" }, { Authorization: "Basic synthetic" },
        { Authorization: `Bearer ${TOKEN}extra` }, { Authorization: `Bearer ${REVIEWER_SECRET}` },
        { Authorization: `Bearer ${TOKEN} extra` },
        { Authorization: "", Cookie: reviewer }, { Authorization: "", Cookie: applicant },
      ]) {
        const payload = await jsonResponse(await f.request(route, { headers }), 401);
        assert.equal(payload.ok, false);
        const serialized = JSON.stringify(payload);
        for (const secret of [TOKEN, COOKIE_SECRET, REVIEWER_SECRET, f.dataRoot]) assert.equal(serialized.includes(secret), false);
      }
    }
    await jsonResponse(await f.request(`${BASE}?token=${TOKEN}`, { headers: { Authorization: "" } }), 401);
    await jsonResponse(await f.request());
  } finally { await f.close(); }
});

test("monitor list uses a narrow projection and totals include processed outcomes across all pages", async () => {
  const f = await fixture();
  try {
    const payload = await jsonResponse(await f.request(`${BASE}?limit=1`));
    assert.deepEqual(Object.keys(payload).sort(), ["ok", "applications", "nextCursor", "hasMore", "totals", "observedAt"].sort());
    assert.equal(payload.ok, true);
    assert.equal(payload.applications.length, 1);
    assert.equal(payload.hasMore, true);
    assert.equal(typeof payload.nextCursor, "string");
    assert.deepEqual(payload.totals, countStatuses(f.records));
    assert.equal(new Date(payload.observedAt).toISOString(), payload.observedAt);
    assert.deepEqual(Object.keys(payload.applications[0]).sort(), LIST_FIELDS);
    assert.equal(payload.applications[0].reviewPath, "/assessment");
    const serialized = JSON.stringify(payload);
    for (const privateValue of ["duplicate@example.com", "synthetic-private-provider-error", "synthetic-private-provider-id", f.dataRoot, TOKEN, COOKIE_SECRET]) {
      assert.equal(serialized.includes(privateValue), false);
    }
    assert.equal(serialized.includes("audioStorageKey"), false);
    assert.equal(serialized.includes("passwordHash"), false);
    assert.equal(serialized.includes("passEmailDraft"), false);
    assert.equal(serialized.includes("teamEmailDrafts"), false);
    assert.deepEqual(f.forbiddenCalls, []);
    const all = await jsonResponse(await f.request());
    assert.deepEqual(all.applications.map((record) => record.applicationId), sortedRecords(f.records).map((record) => record.applicationId));
    assert.equal(all.nextCursor, null);
    assert.equal(all.hasMore, false);
  } finally { await f.close(); }
});

test("monitor keyset pagination preserves same-timestamp IDs and restarts each monitoring scan", async () => {
  const f = await fixture();
  try {
    const seen = [];
    const cursors = new Set();
    let cursor = null;
    do {
      const query = new URLSearchParams({ limit: "2", ...(cursor ? { cursor } : {}) });
      const payload = await jsonResponse(await f.request(`${BASE}?${query}`));
      seen.push(...payload.applications.map((record) => record.applicationId));
      assert.deepEqual(payload.totals, countStatuses(f.records));
      assert.equal(payload.hasMore, payload.nextCursor !== null);
      if (payload.nextCursor) {
        assert.equal(cursors.has(payload.nextCursor), false, "A cursor must make progress");
        cursors.add(payload.nextCursor);
      }
      cursor = payload.nextCursor;
      assert.ok(seen.length <= f.records.length, "Pagination must terminate");
    } while (cursor);
    assert.deepEqual(seen, sortedRecords(f.records).map((record) => record.applicationId));
    assert.equal(new Set(seen).size, f.records.length);
    const newRecord = f.addApplication(f.current, "new-arrival", { submittedAt: "2026-10-04T12:00:00.000Z" });
    const nextPoll = await jsonResponse(await f.request());
    assert.ok(nextPoll.applications.some((record) => record.applicationId === newRecord.applicationId), "A new poll begins without a saved pagination cursor");
    assert.equal(nextPoll.totals.total, f.records.length);
  } finally { await f.close(); }
});

test("monitor filters statuses and cohorts while totals remain independent of page size", async () => {
  const f = await fixture();
  try {
    for (const status of ["all", "pending", "pass", "fail", "invited", "rejected"]) {
      for (const cohortId of [null, f.current.cohortId, f.previous.cohortId, randomUUID()]) {
        const expected = f.records.filter((record) => matchesStatus(record, status) && (!cohortId || record.cohortId === cohortId));
        const query = new URLSearchParams({ limit: "1", status, ...(cohortId ? { cohortId } : {}) });
        const payload = await jsonResponse(await f.request(`${BASE}?${query}`));
        assert.deepEqual(payload.totals, countStatuses(expected));
        assert.deepEqual(payload.applications.map((record) => record.applicationId), sortedRecords(expected).slice(0, 1).map((record) => record.applicationId));
        assert.equal(payload.hasMore, expected.length > 1);
        if (expected.length <= 1) assert.equal(payload.nextCursor, null);
      }
    }
  } finally { await f.close(); }
});

test("monitor rejects malformed queries, identifiers, and cursors instead of silently widening access", async () => {
  const f = await fixture();
  try {
    for (const query of [
      "limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=NaN", "limit=1e2", "limit=",
      "limit=1&limit=2", "status=unknown", "status=PASS", "status=", "status=pass&status=fail",
      "cohortId=not-a-uuid", "cohortId=", `cohortId=${f.current.cohortId}&cohortId=${f.previous.cohortId}`,
      "cursor=not-a-cursor", "cursor=%7B%22submittedAt%22%3A%22invalid%22%7D", "unsupported=true",
    ]) {
      await jsonResponse(await f.request(`${BASE}?${query}`), 400);
    }
    const first = await jsonResponse(await f.request(`${BASE}?limit=1&status=pending`));
    await jsonResponse(await f.request(`${BASE}?${new URLSearchParams({ limit: "1", status: "pass", cursor: first.nextCursor })}`), 400);
    const tampered = `${first.nextCursor.slice(0, -1)}!`;
    await jsonResponse(await f.request(`${BASE}?${new URLSearchParams({ cursor: tampered })}`), 400);
    for (const suffix of ["", "/audio"]) {
      await jsonResponse(await f.request(`${BASE}/not-a-uuid${suffix}`), 400);
      await jsonResponse(await f.request(`${BASE}/${randomUUID()}${suffix}`), 404);
    }
  } finally { await f.close(); }
});

test("monitor detail adds contact email without exposing private storage or provider metadata", async () => {
  const f = await fixture();
  try {
    for (const expected of f.records) {
      const payload = await jsonResponse(await f.request(`${BASE}/${expected.applicationId}`));
      assert.equal(payload.ok, true);
      assert.deepEqual(Object.keys(payload.application).sort(), [...LIST_FIELDS, "email"].sort());
      for (const field of LIST_FIELDS.filter((name) => name !== "reviewPath")) assert.deepEqual(payload.application[field], expected[field]);
      assert.equal(payload.application.email, expected.email);
      assert.equal(payload.application.reviewPath, "/assessment");
      const serialized = JSON.stringify(payload);
      for (const privateValue of [f.dataRoot, expected.audioStorageKey, "synthetic-private-provider-error", "synthetic-private-provider-id", TOKEN]) assert.equal(serialized.includes(privateValue), false);
    }
    assert.deepEqual(f.forbiddenCalls, []);
  } finally { await f.close(); }
});

test("monitor audio stays private and streams exact full, partial, suffix, and invalid ranges", async () => {
  const f = await fixture();
  try {
    const record = f.records[0];
    const file = f.files.get(record.applicationId);
    const route = `${BASE}/${record.applicationId}/audio`;
    const full = await f.request(route);
    assert.equal(full.status, 200);
    assertPrivateResponse(full);
    assert.equal(full.headers.get("content-type"), "audio/webm");
    assert.equal(full.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), file.bytes);
    for (const [range, start, end] of [["bytes=2-5", 2, 6], ["bytes=-4", file.bytes.length - 4, file.bytes.length], ["bytes=3-", 3, file.bytes.length]]) {
      const response = await f.request(route, { headers: { Range: range } });
      assert.equal(response.status, 206);
      assertPrivateResponse(response);
      assert.equal(response.headers.get("content-range"), `bytes ${start}-${end - 1}/${file.bytes.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), file.bytes.subarray(start, end));
    }
    for (const range of ["bytes=999999-", "bytes=4-2", "bytes=0-1,3-4", "bytes=-0", "invalid"]) {
      const response = await f.request(route, { headers: { Range: range } });
      assert.equal(response.status, 416);
      assertPrivateResponse(response);
      assert.equal(response.headers.get("content-range"), `bytes */${file.bytes.length}`);
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
    for (const routeWithKey of [`${BASE}/${encodeURIComponent(record.audioStorageKey)}/audio`, `${BASE}/%2E%2E%2Fsecret/audio`]) {
      const response = await f.request(routeWithKey);
      assert.ok([400, 404].includes(response.status));
    }
    rmSync(file.filePath);
    const missing = await jsonResponse(await f.request(route), 404);
    assert.equal(JSON.stringify(missing).includes(file.filePath), false);
  } finally { await f.close(); }
});

test("monitor scans and read token cannot mutate recruitment state, send email, or trigger storage maintenance", async () => {
  const f = await fixture();
  try {
    const before = f.snapshot();
    for (let poll = 0; poll < 2; poll += 1) {
      let cursor = null;
      do {
        const query = new URLSearchParams({ limit: "3", ...(cursor ? { cursor } : {}) });
        const page = await jsonResponse(await f.request(`${BASE}?${query}`));
        for (const record of page.applications) {
          await jsonResponse(await f.request(`${BASE}/${record.applicationId}`));
          const audio = await f.request(`${BASE}/${record.applicationId}/audio`);
          assert.equal(audio.status, 200);
          await audio.arrayBuffer();
        }
        cursor = page.nextCursor;
      } while (cursor);
    }
    const id = f.records.find((record) => record.decision === "pending").applicationId;
    for (const [method, route, body] of [
      ["POST", `/api/recruitment/reviewer/applications/${id}/decision`, { decision: "pass" }],
      ["POST", `/api/recruitment/reviewer/applications/${id}/team-decision`, { decision: "invited", confirmSent: true }],
      ["DELETE", `/api/recruitment/reviewer/applications/${id}/team-decision`, { confirmReset: true }],
      ["PUT", "/api/recruitment/reviewer/password", { password: "should-not-change" }],
      ["POST", "/api/recruitment/reviewer/cohorts", { password: "should-not-create" }],
      ["DELETE", `/api/recruitment/reviewer/cohorts/${f.current.cohortId}`, { confirm: true }],
      ["POST", "/api/recruitment/reviewer/cohorts/activate-next", { confirm: true }],
      ["POST", `${BASE}/${id}/decision`, { decision: "pass" }],
      ["DELETE", `${BASE}/${id}`, { confirm: true }],
    ]) {
      const response = await f.request(route, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.ok(response.status >= 400 && response.status < 500, `${method} ${route} must be denied`);
      await response.arrayBuffer();
    }
    assert.deepEqual(f.snapshot(), before, "Polling and denied writes must preserve every row, SQLite data version, and private audio file");
    assert.deepEqual(f.forbiddenCalls, []);
  } finally { await f.close(); }
});
