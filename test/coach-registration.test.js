import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import express from "express";
import multer from "multer";

import { createCoachRegistrationRuntime } from "../server/coach-registration.js";
import { createCoachContactCard } from "../server/coach-registration-vcf.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
const ORIGIN = "https://www.patch.app";
const env = {
  NODE_ENV: "test", COACH_REGISTRATION_BACKEND_URL: "https://backend.example.test/api/integrations/coach-registration",
  COACH_REGISTRATION_SECRET: "fixture-only-secret-with-more-than-32-bytes", RECRUITMENT_EMAIL_FROM: "Patch Applications <applications@example.test>",
};

function details(overrides = {}) {
  return {
    requestId: randomUUID(), firstName: "Alex", surname: "Morgan", email: "alex@example.test", phone: "+44 7700 900123", linkedin: "www.example.test/profile",
    availability: JSON.stringify([{ day: "Monday", slots: [{ start: "09:00", end: "12:00" }] }]), ...overrides,
  };
}

function form(input, photo = null) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.append(key, value);
  if (photo) data.append("photo", new Blob([photo.buffer], { type: photo.type }), photo.name || "photo.png");
  return data;
}

async function fixture(options = {}) {
  const backend = [];
  const email = [];
  const backendHandler = options.backendHandler || (() => new Response(JSON.stringify({ status: "created", coachId: "C043", profileId: "coach-registration-fixture", workingTimeZone: "Europe/London" }), { status: 201 }));
  const emailHandler = options.emailHandler || (() => ({ data: { id: "fixture-provider-id" } }));
  const runtime = createCoachRegistrationRuntime({
    env: { ...env, ...options.env }, databasePath: options.dataRoot ? undefined : ":memory:", dataRoot: options.dataRoot,
    now: options.now,
    fetchImpl: async (...args) => { backend.push(args); return backendHandler(...args); },
    emailClient: { emails: { async send(...args) { email.push(args); return emailHandler(...args); } } },
  });
  const app = express();
  runtime.mount(app, { express, multer });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    runtime, backend, email, url,
    async submit(input = details(), photo = null, headers = { Origin: ORIGIN }) {
      const response = await fetch(`${url}/api/coach-registration`, { method: "POST", headers, body: form(input, photo) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
    async close() { await new Promise((resolve) => server.close(resolve)); runtime.close(); },
  };
}

test("registration creates a Coach, forwards no photo or overrides, and emails only Patrick an attached VCF", async () => {
  const f = await fixture();
  try {
    const input = details();
    const result = await f.submit(input, { buffer: PNG, type: "image/png", name: "secret-original-filename.png" });
    assert.deepEqual(result.body, { ok: true, status: "registered", coachId: "C043" });
    assert.equal(result.status, 200);
    const [destination, request] = f.backend[0];
    assert.equal(destination, env.COACH_REGISTRATION_BACKEND_URL);
    assert.equal(request.headers.Authorization, `Bearer ${env.COACH_REGISTRATION_SECRET}`);
    assert.equal(request.redirect, "error");
    const profile = JSON.parse(request.body);
    assert.equal(profile.linkedin, "https://www.example.test/profile");
    assert.equal(profile.requestId, input.requestId);
    assert.equal(Object.hasOwn(profile, "photo"), false);
    assert.equal(Object.hasOwn(profile, "password"), false);
    assert.equal(Object.hasOwn(profile, "role"), false);
    const [payload, options] = f.email[0];
    assert.deepEqual(payload.to, ["patrick@patch.app"]);
    assert.equal(payload.replyTo, undefined);
    assert.equal(options.idempotencyKey, `coach-registration/${input.requestId}`);
    assert.equal(payload.attachments.length, 1);
    const card = payload.attachments[0];
    assert.equal(card.filename, "Alex-Morgan.vcf");
    assert.equal(card.contentType, "text/vcard; charset=utf-8");
    assert.equal(typeof card.content, "string", "Resend receives a base64 string, not a Buffer JSON object");
    const unfolded = Buffer.from(card.content, "base64").toString("utf8").replace(/\r\n /g, "");
    assert.match(unfolded, /VERSION:3.0\r\nN:Morgan;Alex;;;/);
    assert.match(unfolded, new RegExp(`PHOTO;ENCODING=b;TYPE=PNG:${PNG.toString("base64")}`));
    assert.doesNotMatch(payload.text, /123456|Founder|CEO/);
    assert.match(payload.text, /Monday: 09:00–12:00/);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
  } finally { await f.close(); }
});

test("completed retry makes no further backend or email calls; distinct registrations may duplicate contacts", async () => {
  const f = await fixture();
  try {
    const input = details();
    assert.equal((await f.submit(input)).body.ok, true);
    assert.equal((await f.submit(input)).body.ok, true);
    assert.equal(f.backend.length, 1);
    assert.equal(f.email.length, 1);
    assert.equal((await f.submit({ ...input, requestId: randomUUID() })).body.ok, true);
    assert.equal(f.backend.length, 2);
    assert.equal(f.email.length, 2);
  } finally { await f.close(); }
});

test("same request ID with different fields or photo is rejected without another side effect", async () => {
  const f = await fixture();
  try {
    const input = details();
    await f.submit(input);
    assert.equal((await f.submit({ ...input, firstName: "Changed" })).status, 409);
    assert.equal((await f.submit(input, { buffer: PNG, type: "image/png" })).status, 409);
    assert.equal(f.backend.length, 1);
    assert.equal(f.email.length, 1);
  } finally { await f.close(); }
});

test("local validation permits correction only when no earlier account attempt exists", async () => {
  const f = await fixture({ backendHandler: () => { throw new Error("uncertain backend"); } });
  try {
    const input = details();
    const newInvalid = await f.submit({ ...input, firstName: "" });
    assert.equal(newInvalid.status, 400);
    assert.equal(newInvalid.body.accountCreated, false);
    assert.equal((await f.submit(input)).body.code, "registration_retry");
    const invalidRetry = await f.submit({ ...input, firstName: "" });
    assert.equal(invalidRetry.status, 400);
    assert.equal(Object.hasOwn(invalidRetry.body, "accountCreated"), false);
    assert.equal(f.backend.length, 1);
  } finally { await f.close(); }
});

test("concurrent same-ID submissions serialize and complete only once", async () => {
  const f = await fixture({ emailHandler: async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return { data: { id: "one-email" } }; } });
  try {
    const input = details();
    const results = await Promise.all([f.submit(input), f.submit(input), f.submit(input)]);
    assert.ok(results.every((result) => result.body.ok));
    assert.equal(f.backend.length, 1);
    assert.equal(f.email.length, 1);
  } finally { await f.close(); }
});

test("uncertain backend retry keeps the same registration ID and sends no premature email", async () => {
  let attempt = 0;
  const f = await fixture({ backendHandler: () => {
    if (++attempt === 1) throw new Error("sensitive upstream data");
    return new Response(JSON.stringify({ status: "already-created", coachId: "C043", profileId: "coach-registration-fixture", workingTimeZone: "Europe/London" }));
  } });
  try {
    const input = details();
    const uncertain = await f.submit(input);
    assert.equal(uncertain.status, 503);
    assert.equal(uncertain.body.code, "registration_retry");
    assert.match(uncertain.body.message, /same details/);
    assert.doesNotMatch(JSON.stringify(uncertain.body), /sensitive/);
    assert.equal(f.email.length, 0);
    assert.equal((await f.submit(input)).body.ok, true);
    assert.equal(f.backend.length, 2);
    assert.equal(JSON.parse(f.backend[1][1].body).requestId, input.requestId);
    assert.equal(f.email.length, 1);
  } finally { await f.close(); }
});

test("email failure explicitly preserves the created account and retries email idempotently, not account creation", async () => {
  let attempt = 0;
  const f = await fixture({ emailHandler: () => ++attempt === 1 ? { error: { message: "private provider credentials" } } : { data: { id: "recovered-message" } } });
  try {
    const input = details();
    const pending = await f.submit(input);
    assert.equal(pending.status, 503);
    assert.equal(pending.body.accountCreated, true);
    assert.equal(pending.body.coachId, "C043");
    assert.equal(pending.body.code, "registration_email_pending");
    assert.doesNotMatch(JSON.stringify(pending.body), /private provider/);
    assert.equal((await f.submit(input)).body.ok, true);
    assert.equal(f.backend.length, 1);
    assert.equal(f.email.length, 2);
    assert.deepEqual(f.email[0][0], f.email[1][0]);
    assert.equal(f.email[0][1].idempotencyKey, f.email[1][1].idempotencyKey);
    assert.ok(f.email[1][1].signal instanceof AbortSignal);
  } finally { await f.close(); }
});

test("old uncertain email attempts are not resent beyond the provider idempotency window", async () => {
  let current = 10_000;
  const f = await fixture({ now: () => current, emailHandler: () => { throw new Error("uncertain provider"); } });
  try {
    const input = details();
    assert.equal((await f.submit(input)).body.accountCreated, true);
    current += 24 * 60 * 60 * 1000;
    const result = await f.submit(input);
    assert.equal(result.body.accountCreated, true);
    assert.match(result.body.message, /contact Patch/);
    assert.equal(f.email.length, 1);
    assert.equal(f.backend.length, 1);
  } finally { await f.close(); }
});

test("receipt database contains only hashes, IDs, and timestamps; no photo or raw contact details", async () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "website-coach-registration-"));
  const f = await fixture({ dataRoot });
  try {
    const input = details({ firstName: "PrivateFirstname" });
    await f.submit(input, { buffer: PNG, type: "image/png" });
    assert.deepEqual(readdirSync(dataRoot).filter((entry) => !entry.endsWith("-wal") && !entry.endsWith("-shm")), ["coach-registration.sqlite"]);
    const db = new DatabaseSync(path.join(dataRoot, "coach-registration.sqlite"), { readOnly: true });
    const row = db.prepare("SELECT * FROM coach_registration_receipts").get();
    db.close();
    assert.deepEqual(Object.keys(row), ["request_id", "digest", "coach_id", "profile_id", "email_provider_id", "email_attempted_at", "completed_at"]);
    assert.match(row.digest, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(row), /PrivateFirstname|alex@example|900123|profile\"|89504/);
    assert.equal(statSync(path.join(dataRoot, "coach-registration.sqlite")).mode & 0o777, 0o600);
    assert.equal(readFileSync(path.join(dataRoot, "coach-registration.sqlite")).includes(Buffer.from("PrivateFirstname")), false);
  } finally { await f.close(); rmSync(dataRoot, { recursive: true, force: true }); }
});

test("unconfigured runtime fails closed before parsing, account creation, email, or disk writes", async () => {
  const f = await fixture({ env: { COACH_REGISTRATION_SECRET: "too-short" } });
  try {
    const response = await fetch(`${f.url}/api/coach-registration/status`);
    assert.deepEqual(await response.json(), { ready: false, message: "Coach registration is temporarily unavailable. Please try again later." });
    const result = await f.submit();
    assert.equal(result.status, 503);
    assert.equal(f.backend.length, 0);
    assert.equal(f.email.length, 0);
    assert.equal(f.runtime.configured, false);
  } finally { await f.close(); }
});

test("destination config rejects credentials, redirects, insecure production URLs, and query parameters", () => {
  for (const destination of ["https://user:pass@backend.test/api/integrations/coach-registration", "https://backend.test/other", "https://backend.test/api/integrations/coach-registration?secret=value", "https://backend.test/api/integrations/coach-registration#section", "http://backend.test/api/integrations/coach-registration"]) {
    const runtime = createCoachRegistrationRuntime({ env: { ...env, COACH_REGISTRATION_BACKEND_URL: destination }, databasePath: ":memory:", emailClient: {} });
    assert.equal(runtime.configured, false, destination);
    runtime.close();
  }
  const runtime = createCoachRegistrationRuntime({ env: { ...env, NODE_ENV: "production", COACH_REGISTRATION_BACKEND_URL: "http://127.0.0.1/api/integrations/coach-registration" }, emailClient: {} });
  assert.equal(runtime.configured, false);
  runtime.close();
});

test("same-origin protection rejects absent, foreign, and cross-site origins without side effects", async () => {
  const f = await fixture();
  try {
    for (const headers of [{}, { Origin: "https://attacker.example" }, { Origin: ORIGIN, "Sec-Fetch-Site": "cross-site" }]) assert.equal((await f.submit(details(), null, headers)).status, 403);
    assert.equal(f.backend.length, 0);
    assert.equal(f.email.length, 0);
  } finally { await f.close(); }
});

test("rate limit is bounded and rejects excessive posts", async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 12; index += 1) assert.equal((await f.submit(details({ firstName: "" }))).status, 400);
    const blocked = await f.submit();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "600");
    assert.equal(f.backend.length, 0);
  } finally { await f.close(); }
});

test("Railway registration rate limits use the nearest trusted proxy client rather than a shared proxy", async () => {
  const f = await fixture({ env: { NODE_ENV: "production", RAILWAY_SERVICE_ID: "fixture-service", RAILWAY_ENVIRONMENT_ID: "fixture-environment" } });
  try {
    const input = details({ requestId: "invalid" });
    const first = { Origin: ORIGIN, "X-Forwarded-For": "198.51.100.8, 203.0.113.8" };
    for (let index = 0; index < 12; index += 1) assert.equal((await f.submit(input, null, first)).status, 400);
    assert.equal((await f.submit(input, null, first)).status, 429);
    assert.equal((await f.submit(input, null, { Origin: ORIGIN, "X-Forwarded-For": "198.51.100.8, 203.0.113.9" })).status, 400);
    assert.equal((await f.submit(input, null, { Origin: ORIGIN, "X-Forwarded-For": "198.51.100.9, 203.0.113.8" })).status, 429, "untrusted prefix changes cannot bypass the same client's limit");
    assert.equal(f.backend.length, 0);
  } finally { await f.close(); }
});

test("direct requests cannot bypass registration limits with an untrusted forwarded-for header", async () => {
  const f = await fixture();
  try {
    const input = details({ requestId: "invalid" });
    for (let index = 1; index <= 12; index += 1) assert.equal((await f.submit(input, null, { Origin: ORIGIN, "X-Forwarded-For": `203.0.113.${index}` })).status, 400);
    assert.equal((await f.submit(input, null, { Origin: ORIGIN, "X-Forwarded-For": "203.0.113.99" })).status, 429);
    assert.equal(f.backend.length, 0);
  } finally { await f.close(); }
});

test("rejects malformed fields, unsafe profile URLs, overrides, unsupported days, times, and gaps", async () => {
  const cases = [
    { firstName: "Bad\nHeader" }, { email: "not-email" }, { requestId: "short" }, { linkedin: "javascript:alert(1)" }, { linkedin: "https://user:pass@example.test" }, { password: "override" },
    { availability: "[]" }, { availability: "not-json" },
    { availability: JSON.stringify([{ day: "Sunday", slots: [{ start: "09:00", end: "10:00" }] }]) },
    { availability: JSON.stringify([{ day: "Monday", slots: [{ start: "05:45", end: "10:00" }] }]) },
    { availability: JSON.stringify([{ day: "Monday", slots: [{ start: "09:05", end: "10:00" }] }]) },
    { availability: JSON.stringify([{ day: "Monday", slots: [{ start: "09:00", end: "10:00" }, { start: "10:00", end: "11:00" }] }]) },
  ];
  for (const overrides of cases) {
    const f = await fixture();
    try { assert.equal((await f.submit(details(overrides))).status, 400); assert.equal(f.backend.length, 0); } finally { await f.close(); }
  }
});

test("allows any HTTP(S) profile URL and sorts canonical availability", async () => {
  const f = await fixture();
  try {
    const input = details({ linkedin: "https://example.test/not-linkedin", availability: JSON.stringify([
      { day: "Friday", slots: [{ start: "17:00", end: "18:00" }, { start: "09:00", end: "10:00" }] },
      { day: "Monday", slots: [] },
    ]) });
    assert.equal((await f.submit(input)).body.ok, true);
    const saved = JSON.parse(f.backend[0][1].body);
    assert.equal(saved.linkedin, input.linkedin);
    assert.deepEqual(saved.availability, [{ day: "Friday", slots: [{ start: "09:00", end: "10:00" }, { start: "17:00", end: "18:00" }] }]);
  } finally { await f.close(); }
});

test("rejects fake images, WebP/SVG, and oversized photo files before creating accounts", async () => {
  for (const photo of [{ buffer: Buffer.from("not-png"), type: "image/png" }, { buffer: PNG, type: "image/webp" }, { buffer: PNG, type: "image/svg+xml" }, { buffer: Buffer.alloc(1024 * 1024 + 1), type: "image/png" }]) {
    const f = await fixture();
    try { assert.ok([400, 413].includes((await f.submit(details(), photo)).status)); assert.equal(f.backend.length, 0); } finally { await f.close(); }
  }
});

test("backend rejection and malformed success cannot trigger a confirmation email", async () => {
  for (const backendHandler of [() => new Response("private", { status: 401 }), () => new Response("{}", { status: 409 }), () => new Response("invalid-json"), () => new Response(JSON.stringify({ status: "created", coachId: "secret bad", profileId: "fixture", workingTimeZone: "Europe/London" }))]) {
    const f = await fixture({ backendHandler });
    try { const result = await f.submit(); assert.ok([409, 503].includes(result.status)); assert.equal(f.email.length, 0); assert.doesNotMatch(JSON.stringify(result.body), /private|secret bad/); } finally { await f.close(); }
  }
});

test("vCard escapes structured text, folds UTF-8 by bytes, and has safe filenames", () => {
  const profile = { firstName: "Émilie".repeat(30), surname: "O;Connor,\\Name\nInjected", phone: "+44 123", email: "fixture@example.test", linkedin: "https://example.test/a,b;c" };
  const card = createCoachContactCard(profile, { buffer: Buffer.from([255, 216, 255, 0]), mimeType: "image/jpeg" });
  const content = card.content.toString("utf8");
  for (const line of content.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  const unfolded = content.replace(/\r\n /g, "");
  assert.match(unfolded, /N:O\\;Connor\\,\\\\Name\\nInjected;/);
  assert.match(unfolded, /PHOTO;ENCODING=b;TYPE=JPEG:\/9j\/AA==/);
  assert.match(card.filename, /^[a-zA-Z0-9-]+\.vcf$/);
  assert.equal(content.endsWith("END:VCARD\r\n"), true);
});
