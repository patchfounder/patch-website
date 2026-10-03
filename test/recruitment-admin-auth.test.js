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
  const { service: serviceOverrides, ...appOptions } = options;
  const codec = createSignedCookieCodec("test-only-admin-cookie-key-with-more-than-32-bytes");
  const service = {
    listPendingApplications: () => [],
    listProcessedApplications: () => [],
    listCohortControls: () => ({ current: null, previous: null, next: null }),
    validateApplicantSession: () => { throw Object.assign(new Error("Applicant login required."), { statusCode: 401 }); },
    ...serviceOverrides,
  };
  const app = await createRecruitmentApp({
    service,
    cookieCodec: codec,
    reviewerSecret: "abc123DEF456",
    secureCookies: true,
    ...appOptions,
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

const APPLICANT_PASSWORD = "test-only window password";
const unlockPaths = ["/api/recruitment/unlock", "/api/recruitment/applicant/unlock"];
const unlock = (baseUrl, password, route = unlockPaths[0]) => fetch(`${baseUrl}${route}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
});

function windowService(state = "open") {
  return {
    async unlockApplicant(password) {
      if (state !== "open") {
        throw Object.assign(new Error(`Application window is ${state}.`), { statusCode: 403, code: `window_${state}` });
      }
      if (password !== APPLICANT_PASSWORD) {
        throw Object.assign(new Error("Incorrect application password."), { statusCode: 401, code: "invalid_application_password" });
      }
      const expiresAt = new Date(Date.now() + 60_000);
      return { expiresAt, sessionPayload: { v: 1, kind: "applicant", exp: Math.floor(expiresAt.getTime() / 1000) }, cohort: { id: "fixture-window" } };
    },
  };
}

test("the existing applicant password routes accept master login without any application window", async () => {
  let applicantCalls = 0;
  let state = "missing";
  const service = {
    async unlockApplicant(password) {
      applicantCalls += 1;
      return windowService(state).unlockApplicant(password);
    },
  };
  await withApp({ adminPasswordHash: await fixtureHash, service }, async (baseUrl) => {
    for (state of ["missing", "future", "closed"]) {
      for (const route of unlockPaths) {
        const response = await unlock(baseUrl, FIXTURE_PASSWORD, route);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true, role: "reviewer", redirectTo: "/assessment" });
        const setCookie = response.headers.get("set-cookie");
        assert.match(setCookie, /patch_recruitment_reviewer=/);
        assert.equal(setCookie.includes("patch_recruitment_applicant="), false);
        const cookie = setCookie.split(";")[0];
        const reviewer = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, { headers: { cookie } });
        assert.equal(reviewer.status, 200);
        const applicant = await fetch(`${baseUrl}/api/recruitment/applications`, { method: "POST", headers: { cookie } });
        assert.equal(applicant.status, 401);
      }
    }
    assert.equal(applicantCalls, 0);
    for (state of ["missing", "future", "closed"]) {
      const applicant = await unlock(baseUrl, APPLICANT_PASSWORD);
      assert.equal(applicant.status, 403);
      assert.equal((await applicant.json()).code, `window_${state}`);
      assert.equal(applicant.headers.get("set-cookie"), null);
    }
  });
});

test("successful applicants neither consume the master-password budget nor gain reviewer access", async () => {
  await withApp({ adminPasswordHash: await fixtureHash, service: windowService() }, async (baseUrl) => {
    for (let index = 0; index < 12; index += 1) {
      const response = await unlock(baseUrl, APPLICANT_PASSWORD, unlockPaths[index % 2]);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.unlocked, true);
      assert.equal(body.role, undefined);
      assert.equal(body.redirectTo, undefined);
      const setCookie = response.headers.get("set-cookie");
      assert.match(setCookie, /patch_recruitment_applicant=/);
      assert.equal(setCookie.includes("patch_recruitment_reviewer="), false);
      const reviewer = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, {
        headers: { cookie: setCookie.split(";")[0] },
      });
      assert.equal(reviewer.status, 401);
    }
    assert.equal((await login(baseUrl, FIXTURE_PASSWORD)).status, 200);
  });
});

test("all master-password entry points share one limit without blocking real applicants", async () => {
  let now = 10_000;
  await withApp({ adminPasswordHash: await fixtureHash, reviewerNow: () => now, service: windowService() }, async (baseUrl) => {
    for (let index = 0; index < 10; index += 1) {
      const response = index % 3 === 0
        ? await login(baseUrl, "wrong")
        : await unlock(baseUrl, "wrong", unlockPaths[index % 2]);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    for (const route of ["/api/recruitment/reviewer/login", ...unlockPaths]) {
      const limited = await unlock(baseUrl, FIXTURE_PASSWORD, route);
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "900");
      assert.equal(limited.headers.get("set-cookie"), null);
    }
    for (const route of unlockPaths) {
      assert.equal((await unlock(baseUrl, APPLICANT_PASSWORD, route)).status, 200);
    }
    assert.equal((await login(baseUrl, FIXTURE_PASSWORD)).status, 429);
    now += 900_000;
    assert.equal((await unlock(baseUrl, FIXTURE_PASSWORD)).status, 200);
  });
});

test("an applicant refund removes only its own failed reservation, even at the same timestamp", async () => {
  const auth = createAdminPasswordAuth({ passwordHash: await fixtureHash, now: () => 10_000 });
  const failures = await Promise.all(Array.from({ length: 10 }, () => auth.authenticate(null)));
  failures[0].releaseApplicantAttempt();
  failures[0].releaseApplicantAttempt();
  assert.deepEqual(await auth.authenticate(FIXTURE_PASSWORD), { ok: true });
  assert.equal((await auth.authenticate(FIXTURE_PASSWORD)).statusCode, 429);
});

test("combined unlock requires safe JSON and preserves legacy applicant login when admin is unconfigured", async () => {
  await withApp({ adminPasswordHash: await fixtureHash, service: windowService() }, async (baseUrl) => {
    for (const route of unlockPaths) {
      const form = await fetch(`${baseUrl}${route}`, { method: "POST", body: new URLSearchParams({ password: FIXTURE_PASSWORD }) });
      assert.equal(form.status, 415);
      for (const [body, status] of [["{", 400], ["x".repeat(2048), 413]]) {
        const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        assert.equal(response.status, status);
        assert.equal(response.headers.get("set-cookie"), null);
      }
      for (const password of [null, {}, 123456, "a".repeat(257)]) {
        const response = await unlock(baseUrl, password, route);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
  });
  await withApp({ service: windowService() }, async (baseUrl) => {
    for (const route of unlockPaths) {
      const response = await unlock(baseUrl, APPLICANT_PASSWORD, route);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).unlocked, true);
    }
    const wrong = await unlock(baseUrl, "wrong");
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, "invalid_application_password");
  });
});
