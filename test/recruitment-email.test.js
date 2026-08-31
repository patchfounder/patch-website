import assert from "node:assert/strict";
import test from "node:test";

import { createRecruitmentEmailSender } from "../server/recruitment-email.js";

test("approved pass/fail copy is sent through one Resend call per invocation", async () => {
  const payloads = [];
  const sender = createRecruitmentEmailSender({
    from: "Patrick at Patch <recruitment@example.com>",
    bookingUrl: "https://example.com/book-patrick",
    client: {
      emails: {
        async send(payload) {
          payloads.push(payload);
          return { data: { id: `message-${payloads.length}` } };
        },
      },
    },
  });
  assert.equal(sender.configured, true);

  const pass = await sender.sendOutcome({
    applicationId: "pass-application",
    fullName: "Alex Applicant",
    email: "alex@example.com",
    decision: "pass",
  });
  assert.deepEqual(pass, { ok: true, providerId: "message-1" });
  assert.equal(payloads[0].subject, "You’ve passed Stage One | Patch");
  assert.match(payloads[0].text, /passed Stage One of your application to become a Legal Speaking Coach/);
  assert.match(payloads[0].text, /30-minute video interview with Patrick, our founder/);
  assert.match(payloads[0].text, /role, your availability and give you time to ask questions/);
  assert.match(payloads[0].text, /https:\/\/example\.com\/book-patrick/);
  assert.match(payloads[0].text, /We look forward to meeting you\./);
  assert.match(payloads[0].text, /Patrick\nFounder, Patch$/);

  const fail = await sender.sendOutcome({
    applicationId: "fail-application",
    fullName: "Taylor Applicant",
    email: "taylor@example.com",
    decision: "fail",
  });
  assert.deepEqual(fail, { ok: true, providerId: "message-2" });
  assert.equal(payloads[1].subject, "Your Patch application");
  assert.match(payloads[1].text, /Legal Speaking Coach internship/);
  assert.match(payloads[1].text, /voice note/);
  assert.match(payloads[1].text, /won’t be inviting you to Stage Two/);
  assert.match(payloads[1].text, /wish you every success with your next steps/);
  assert.match(payloads[1].text, /Patrick\nFounder, Patch$/);
  assert.equal(payloads.length, 2);
});

test("missing sender configuration reports failure without making a provider call", async () => {
  let calls = 0;
  const sender = createRecruitmentEmailSender({
    apiKey: "",
    from: "",
    client: { emails: { async send() { calls += 1; } } },
  });
  assert.equal(sender.configured, false);
  const result = await sender.sendOutcome({
    fullName: "No Sender",
    email: "nobody@example.com",
    decision: "pass",
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});
