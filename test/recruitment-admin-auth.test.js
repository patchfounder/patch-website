import assert from "node:assert/strict";
import test from "node:test";

import { createRecruitmentApp, createRecruitmentRuntime } from "../server/app.js";
import { createSignedCookieCodec, REVIEWER_COOKIE_NAME } from "../server/recruitment-access.js";
import {
  createAdminPasswordAuth,
  hashAdminPassword,
  validateAdminPasswordHash,
} from "../server/recruitment-admin-auth.js";

const FIXTURE_PASSWORD = "test-only administration password";
const fixtureHash = hashAdminPassword(FIXTURE_PASSWORD);

test("admin hashes use a fresh salt, strict fixed parameters, and no plaintext", async () => {
  const first = await fixtureHash;
  const second = await hashAdminPassword(FIXTURE_PASSWORD);
  assert.notEqual(first, second);
  assert.equal(first.includes(FIXTURE_PASSWORD), false);
  assert.equal(validateAdminPasswordHash(first), first);
  for (const absent of [undefined, null, ""]) assert.equal(validateAdminPasswordHash(absent), null);
  for (const invalid of [123, {}, "plain-password", first.replace("16384", "999999999"), `${first}$extra`]) {
    assert.throws(() => validateAdminPasswordHash(invalid), /supported salted scrypt format/);
  }
  for (const invalid of [null, {}, 123456, "", "a".repeat(257), "😀".repeat(65)]) {
    await assert.rejects(hashAdminPassword(invalid), /1–256 bytes/);
  }
  // Invalid configuration must fail before runtime initializes any storage.
  let storageTouched = false;
  await assert.rejects(createRecruitmentRuntime({
    env: { RECRUITMENT_ADMIN_PASSWORD_HASH: "invalid" },
    storage: { initialize() { storageTouched = true; } },
  }), /supported salted scrypt format/);
  assert.equal(storageTouched, false);
});

test("admin password matching is exact, bounded, and unavailable without configuration", async () => {
  assert.equal((await createAdminPasswordAuth().authenticate(FIXTURE_PASSWORD)).statusCode, 503);
  const auth = createAdminPasswordAuth({ passwordHash: await fixtureHash });
  for (const invalid of [null, {}, 123456, "", "a".repeat(257), ` ${FIXTURE_PASSWORD}`, `${FIXTURE_PASSWORD} `, "wrong"]) {
    assert.equal((await auth.authenticate(invalid)).statusCode, 401);
  }
  assert.deepEqual(await auth.authenticate(FIXTURE_PASSWORD), { ok: true });
});

test("the global rolling attempt cap survives successes and concurrent attempts", async () => {
  let now = 10_000;
  const auth = createAdminPasswordAuth({ passwordHash: await fixtureHash, now: () => now });
  const attempts = await Promise.all(Array.from({ length: 12 }, () => auth.authenticate(FIXTURE_PASSWORD)));
  assert.equal(attempts.filter((result) => result.ok).length, 10);
  assert.equal(attempts.filter((result) => result.statusCode === 429).length, 2);
  assert.equal(attempts[10].retryAfterSeconds, 900);
  now += 899_000;
  assert.equal((await auth.authenticate(FIXTURE_PASSWORD)).retryAfterSeconds, 1);
  now += 1000;
  assert.deepEqual(await auth.authenticate(FIXTURE_PASSWORD), { ok: true });
});

async function withApp(options, run) {
  const codec = createSignedCookieCodec("test-only-admin-cookie-key-with-more-than-32-bytes");
  const service = {
    listPendingApplications: () => [],
    listProcessedApplications: () => [],
    listCohortControls: () => ({ current: null, previous: null, next: null }),
    validateApplicantSession: () => { throw Object.assign(new Error("Applicant login required."), { statusCode: 401 }); },
  };
  const app = await createRecruitmentApp({
    service,
    cookieCodec: codec,
    reviewerSecret: "abc123DEF456",
    secureCookies: true,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`, codec);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const login = (baseUrl, password, extraHeaders = {}) => fetch(`${baseUrl}/api/recruitment/reviewer/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...extraHeaders },
  body: JSON.stringify({ password }),
  redirect: "manual",
});

test("admin HTTP login grants only the existing expiring reviewer session and supports logout", async () => {
  let now = Date.parse("2026-10-03T10:00:00Z");
  await withApp({ adminPasswordHash: await fixtureHash, reviewerNow: () => now }, async (baseUrl, codec) => {
    for (const [method, route] of [
      ["GET", "/state"], ["GET", "/cohorts"], ["GET", "/applications/fixture/audio"],
      ["POST", "/applications/fixture/decision"], ["POST", "/cohorts"], ["DELETE", "/cohorts/fixture"],
    ]) {
      const response = await fetch(`${baseUrl}/api/recruitment/reviewer${route}`, { method });
      assert.equal(response.status, 401);
    }
    const rejected = await login(baseUrl, "wrong");
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
    const accepted = await login(baseUrl, FIXTURE_PASSWORD);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { ok: true, redirectTo: "/assessment" });
    assert.match(accepted.headers.get("cache-control"), /no-store/);
    const setCookie = accepted.headers.get("set-cookie");
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=1200"]) {
      assert.ok(setCookie.includes(attribute));
    }
    assert.equal(setCookie.includes("patch_recruitment_applicant"), false);
    const cookie = setCookie.split(";")[0];
    const signedValue = decodeURIComponent(cookie.slice(`${REVIEWER_COOKIE_NAME}=`.length));
    assert.deepEqual(codec.unseal(signedValue), { v: 1, kind: "reviewer", exp: now / 1000 + 1200 });
    const state = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, { headers: { cookie } });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).authenticated, true);
    const applicant = await fetch(`${baseUrl}/api/recruitment/applications`, { method: "POST", headers: { cookie } });
    assert.equal(applicant.status, 401);
    const logout = await fetch(`${baseUrl}/api/recruitment/reviewer/logout`, { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    const loggedOut = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, {
      headers: { cookie: logout.headers.get("set-cookie").split(";")[0] },
    });
    assert.equal(loggedOut.status, 401);
    now += 1200 * 1000;
    const expired = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, { headers: { cookie } });
    assert.equal(expired.status, 401);
    assert.match(expired.headers.get("set-cookie"), /Max-Age=0/);
  });
});

test("admin HTTP login rejects unsafe input and throttles globally regardless of forwarding headers", async () => {
  await withApp({ adminPasswordHash: await fixtureHash }, async (baseUrl) => {
    const form = await fetch(`${baseUrl}/api/recruitment/reviewer/login`, {
      method: "POST", body: new URLSearchParams({ password: FIXTURE_PASSWORD }),
    });
    assert.equal(form.status, 415);
    assert.match(form.headers.get("cache-control"), /no-store/);
    for (const [body, expectedStatus] of [["{", 400], ["x".repeat(2048), 413]]) {
      const response = await fetch(`${baseUrl}/api/recruitment/reviewer/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    for (let index = 0; index < 10; index += 1) {
      const response = await login(baseUrl, "wrong", { "X-Forwarded-For": `192.0.2.${index}` });
      assert.equal(response.status, 401);
    }
    const limited = await login(baseUrl, FIXTURE_PASSWORD, { "X-Forwarded-For": "198.51.100.1" });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(limited.headers.get("set-cookie"), null);
  });
});

test("missing admin configuration leaves the existing secret-link login available", async () => {
  await withApp({}, async (baseUrl) => {
    const unavailable = await login(baseUrl, FIXTURE_PASSWORD);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("set-cookie"), null);
    const legacy = await fetch(`${baseUrl}/assessment/abc123DEF456`, { redirect: "manual" });
    assert.equal(legacy.status, 303);
    assert.equal(legacy.headers.get("location"), "/assessment");
    assert.match(legacy.headers.get("set-cookie"), /patch_recruitment_reviewer=/);
  });
});
