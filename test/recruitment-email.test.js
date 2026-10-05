import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createRecruitmentEmailSender } from "../server/recruitment-email.js";

const SIGNATURE_HTML = readFileSync(new URL("../server/patrick-email-signature.html", import.meta.url), "utf8");
const SIGNATURE_TEXT = [
  "Patrick Beattie",
  "Founder | CEO",
  "",
  "Patch App LLC",
  "447 Broadway, 2nd Floor",
  "New York, NY 10013, United States",
  "Mobile: +1 904 983 7147",
  "www.patch.app",
].join("\n");

function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function assertConsistentTypography(html) {
  const outerTable = html.match(/<table\b([^>]*)>/i)?.[1] || "";
  assert.match(outerTable, /role="presentation"/);
  assert.match(outerTable, /\bwidth="600"/);
  assert.match(outerTable, /width:100%/);
  assert.match(outerTable, /max-width:600px/);
  const stack = [];
  let visibleRuns = 0;
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith("<!--")) continue;
    const closing = token.match(/^<\/([a-z][\w:-]*)/i);
    if (closing) {
      const index = stack.findLastIndex((entry) => entry.name === closing[1].toLowerCase());
      if (index >= 0) stack.splice(index);
      continue;
    }
    const opening = token.match(/^<([a-z][\w:-]*)\b/i);
    if (opening) {
      const name = opening[1].toLowerCase();
      if (!["br", "hr", "img", "meta", "link", "input"].includes(name) && !token.endsWith("/>")) {
        stack.push({ name, style: token.match(/\bstyle="([^"]*)"/i)?.[1] || "" });
      }
      continue;
    }
    if (!visibleText(token)) continue;
    const style = stack.at(-1)?.style || "";
    assert.match(style, /font-family:\s*Arial,\s*Helvetica,\s*sans-serif\s*;/i);
    assert.match(style, /font-size:\s*14px\s*;/i);
    assert.match(style, /font-weight:\s*(?:400|normal)\s*;/i);
    assert.match(style, /line-height:\s*20px\s*;/i);
    visibleRuns += 1;
  }
  assert.ok(visibleRuns >= 10, "body, booking link, and signature text are all checked");
}

function assertOriginalSignature(payload) {
  assert.equal(payload.html.split(SIGNATURE_HTML).length - 1, 1, "the exact signature asset is embedded once");
  assert.equal((payload.html.match(/data-patch-signature/g) || []).length, 1);
  assert.equal(payload.text.split(SIGNATURE_TEXT).length - 1, 1, "the full plain-text signature is included once");
  assert.ok(payload.text.endsWith(SIGNATURE_TEXT));
  assert.doesNotMatch(payload.html, /<\s*(?:img|picture|svg)\b|\bcid:|data:image\/|background(?:-image)?\s*:[^;]*url\(/i);
  assert.equal(payload.attachments, undefined, "the text-only signature requires no image attachments");
  assert.doesNotMatch(payload.html, /Patrick<br>Founder, Patch/);
  assert.doesNotMatch(payload.text, /Patrick\nFounder, Patch/);
  assertConsistentTypography(payload.html);
}

test("pass invitations open as a prefilled draft and only fail outcomes use Resend", async () => {
  const payloads = [];
  const sender = createRecruitmentEmailSender({
    apiKey: "",
    from: "Patrick at Patch <recruitment@example.com>",
    replyTo: "patrick@example.com",
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

  const passApplication = {
    applicationId: "pass-application",
    fullName: "Alex Applicant",
    email: "alex@example.com",
  };
  const draft = sender.createPassEmailDraft(passApplication);
  assert.deepEqual(draft, {
    to: "alex@example.com",
    subject: "You’ve passed Stage One | Patch",
    body: [
      "Hi Alex,",
      "",
      "Congratulations—you’ve passed Stage One of your application to become a Legal Speaking Coach at Patch.",
      "",
      "I’d like to invite you to a 30-minute video interview. We’ll discuss the role, your availability and give you time to ask questions.",
      "",
      "Book your interview",
      "https://example.com/book-patrick",
      "",
      "I look forward to meeting you.",
      "",
      "Kind regards,",
    ].join("\n"),
  });
  assert.doesNotMatch(draft.body, /Patrick Beattie|Founder \| CEO/);
  assert.deepEqual(await sender.sendOutcome({ ...passApplication, decision: "pass" }), {
    ok: false,
    error: "Pass invitations are prepared in the reviewer's mail app.",
  });
  assert.equal(payloads.length, 0, "pass invitations are never sent by the Website server");

  const fail = await sender.sendOutcome({
    applicationId: "fail-application",
    fullName: "Taylor Applicant",
    email: "taylor@example.com",
    decision: "fail",
  });
  assert.deepEqual(fail, { ok: true, providerId: "message-1" });
  assert.equal(payloads[0].from, "Patrick at Patch <recruitment@example.com>");
  assert.deepEqual(payloads[0].to, ["taylor@example.com"]);
  assert.equal(payloads[0].replyTo, "patrick@example.com");
  assert.equal(payloads[0].subject, "Your Patch application");
  assert.match(payloads[0].text, /Legal Speaking Coach internship/);
  assert.match(payloads[0].text, /voice note/);
  assert.match(payloads[0].text, /I won’t be inviting you to an interview/);
  assert.match(payloads[0].text, /wish you every success with your next steps/);
  assert.equal(payloads[0].text, [
    "Hi Taylor,",
    "",
    "Thank you for taking the time to apply for the Legal Speaking Coach internship and send me your voice note.",
    "",
    "After reviewing your application, I won’t be inviting you to an interview on this occasion.",
    "",
    "I appreciate your interest in Patch and wish you every success with your next steps.",
    "",
    SIGNATURE_TEXT,
  ].join("\n"));
  assertOriginalSignature(payloads[0]);
  assert.equal(visibleText(payloads[0].html.replace(SIGNATURE_HTML, "")), [
    "Hi Taylor,",
    "Thank you for taking the time to apply for the Legal Speaking Coach internship and send me your voice note.",
    "After reviewing your application, I won’t be inviting you to an interview on this occasion.",
    "I appreciate your interest in Patch and wish you every success with your next steps.",
  ].join(" "));
  assert.doesNotMatch(payloads[0].text, /send us|we won’t|Stage Two|We appreciate/);
  assert.equal(payloads.length, 1);
});

test("the signature resolves relative to the email module, independently of the working directory", () => {
  const moduleUrl = new URL("../server/recruitment-email.js", import.meta.url).href;
  const script = `
    const { createRecruitmentEmailSender } = await import(${JSON.stringify(moduleUrl)});
    let captured;
    const sender = createRecruitmentEmailSender({
      apiKey: "", from: "Patch <recruitment@example.com>", replyTo: "",
      bookingUrl: "https://example.com/book",
      client: { emails: { async send(payload) {
        captured = payload;
        return { data: { id: "synthetic-cwd-test" } };
      } } },
    });
    const result = await sender.sendOutcome({
      fullName: "Synthetic Applicant", email: "synthetic@example.com", decision: "fail",
    });
    process.stdout.write(JSON.stringify({ result, payload: captured }));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: tmpdir(),
    env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const { result, payload } = JSON.parse(child.stdout);
  assert.deepEqual(result, { ok: true, providerId: "synthetic-cwd-test" });
  assertOriginalSignature(payload);
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
    decision: "fail",
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});
