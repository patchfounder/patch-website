import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationWindowIdentity,
  bearerTokenMatches,
  cohortWindowState,
  createSignedCookieCodec,
  hashCohortPassword,
  londonLocalDateTimeToIso,
  verifyCohortPassword,
} from "../server/recruitment-access.js";

test("UK timestamps are deterministic and reject DST gaps and overlaps", () => {
  assert.equal(londonLocalDateTimeToIso("2026-09-01T09:00"), "2026-09-01T08:00:00.000Z");
  assert.equal(londonLocalDateTimeToIso("2026-12-01T09:00"), "2026-12-01T09:00:00.000Z");
  assert.throws(
    () => londonLocalDateTimeToIso("2026-03-29T01:30"),
    (error) => error.code === "missing_london_time",
  );
  assert.throws(
    () => londonLocalDateTimeToIso("2026-10-25T01:30"),
    (error) => error.code === "ambiguous_london_time",
  );
});

test("application-window title follows its UK opening month", () => {
  assert.deepEqual(
    applicationWindowIdentity("2026-09-30T23:00:00.000Z"),
    { monthKey: "2026-10", displayName: "October 2026" },
  );
  assert.deepEqual(
    applicationWindowIdentity("2026-12-01T09:00:00.000Z"),
    { monthKey: "2026-12", displayName: "December 2026" },
  );
});

test("application-window closing is a hard exclusive deadline", () => {
  const cohort = {
    opensAt: "2026-09-01T07:00:00.000Z",
    closesAt: "2026-09-30T21:00:00.000Z",
  };
  assert.equal(cohortWindowState(cohort, new Date(cohort.opensAt)), "open");
  assert.equal(cohortWindowState(cohort, new Date(cohort.closesAt)), "closed");
});

test("shared passwords are scrypt-hashed and remain reusable", async () => {
  const record = await hashCohortPassword("monthly-shared-password");
  assert.notEqual(record.hash.toString("hex"), Buffer.from("monthly-shared-password").toString("hex"));
  const persistedRecord = {
    passwordSalt: record.salt,
    passwordHash: record.hash,
    passwordParameters: record.parameters,
  };
  assert.equal(await verifyCohortPassword("monthly-shared-password", persistedRecord), true);
  assert.equal(await verifyCohortPassword("wrong-password", persistedRecord), false);
  assert.equal(await verifyCohortPassword("monthly-shared-password", persistedRecord), true);
});

test("signed cookies and the exact 12-character reviewer secret reject tampering", () => {
  const codec = createSignedCookieCodec("a-cookie-secret-longer-than-thirty-two-bytes");
  const value = codec.seal({ v: 1, kind: "applicant", cohortId: "cohort" });
  assert.deepEqual(codec.unseal(value), { v: 1, kind: "applicant", cohortId: "cohort" });
  const last = value.at(-1);
  assert.equal(codec.unseal(`${value.slice(0, -1)}${last === "A" ? "B" : "A"}`), null);
  assert.equal(bearerTokenMatches("Bearer ABCDEFGHIJKL", "ABCDEFGHIJKL"), true);
  assert.equal(bearerTokenMatches("Bearer ABCDEFGHIJKM", "ABCDEFGHIJKL"), false);
  assert.equal(bearerTokenMatches("Bearer ABCDEFGHIJKLx", "ABCDEFGHIJKL"), false);
});
