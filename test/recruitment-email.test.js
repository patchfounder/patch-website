import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createRecruitmentEmailSender } from "../server/recruitment-email.js";

const SIGNATURE_HTML = readFileSync(new URL("../server/patrick-email-signature.html", import.meta.url), "utf8");
const APPROVED_SIGNATURE_SHA256 = "e86df3b54f63306ae5711452b481d6c524df3555dda2bb47c9d62ca23571d9ca";
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

function assertApprovedFormatting(html) {
  const authored = html.replace(SIGNATURE_HTML, "");
  assert.match(authored, /^<div data-email-content dir="ltr" style="overflow-wrap:anywhere;word-break:break-word;">/);
  assert.doesNotMatch(authored, /font-size|font-family|line-height|<\s*h[1-6]\b|<\s*font\b|<\s*big\b/i,
    "authored text inherits normal mail-client typography");
  assert.equal((authored.match(/<div><br><\/div>/g) || []).length, 5,
    "the approved greeting, paragraph, closing and signature gaps are retained");
  const signatureAt = html.indexOf(SIGNATURE_HTML);
  const signOffAt = html.lastIndexOf("<div>Patrick</div>", signatureAt);
  assert.ok(signOffAt >= 0, "a personal Patrick sign-off precedes the signature");
  assert.match(html.slice(signOffAt, signatureAt), /^<div>Patrick<\/div>\s*<div><br><\/div>\s*$/);
  assert.match(authored, /<div>Kind regards,<\/div>\s*<div>Patrick<\/div>/);
}

function assertCanonicalSignature(payload) {
  assert.equal(createHash("sha256").update(SIGNATURE_HTML).digest("hex"), APPROVED_SIGNATURE_SHA256,
    "the Website signature is the exact static asset approved in the preview");
  assert.equal(payload.html.split(SIGNATURE_HTML).length - 1, 1, "the exact signature asset is embedded once");
  assert.equal(payload.text.split(SIGNATURE_TEXT).length - 1, 1, "the full plain-text signature is included once");
  assert.ok(payload.text.endsWith(`Kind regards,\nPatrick\n\n${SIGNATURE_TEXT}`),
    "the plain-text personal sign-off is separate from the full signature");
  assert.doesNotMatch(payload.html, /<\s*(?:img|picture|svg)\b|\bcid:|data:image\/|background(?:-image)?\s*:[^;]*url\(/i);
  assert.equal(payload.attachments, undefined, "the text-only signature requires no image attachments");
  assert.doesNotMatch(payload.html, /Patrick<br>Founder, Patch/);
  assert.doesNotMatch(payload.text, /Patrick\nFounder, Patch/);
  assert.match(SIGNATURE_HTML, /font-size:15px/);
  assert.match(SIGNATURE_HTML, /font-size:12px/);
  assertApprovedFormatting(payload.html);
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
  assert.equal(payloads[0].text, [
    "Hi Taylor,",
    "",
    "Thank you for your interest in Patch and for taking the time to submit your recording.",
    "",
    "Unfortunately, your application has not been selected for the next stage on this occasion.",
    "",
    "Thank you again for the time and effort put into your application, and best wishes for the future.",
    "",
    "Kind regards,",
    "Patrick",
    "",
    SIGNATURE_TEXT,
  ].join("\n"));
  assertCanonicalSignature(payloads[0]);
  assert.equal(visibleText(payloads[0].html.replace(SIGNATURE_HTML, "")), [
    "Hi Taylor,",
    "Thank you for your interest in Patch and for taking the time to submit your recording.",
    "Unfortunately, your application has not been selected for the next stage on this occasion.",
    "Thank you again for the time and effort put into your application, and best wishes for the future.",
    "Kind regards,",
    "Patrick",
  ].join(" "));
  const authoredBody = payloads[0].text.replace(SIGNATURE_TEXT, "").replace(/^Hi [^\n]+,\n\n/, "");
  assert.doesNotMatch(authoredBody, /\b(?:I|we|me|us|our)\b/i);
  assert.doesNotMatch(payloads[0].text, /I won’t|I appreciate|red flags|Stage Two/);
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
  assertCanonicalSignature(payload);
});

test("rejection greetings escape applicant-provided HTML while preserving plain text and approved formatting", async () => {
  let captured;
  const sender = createRecruitmentEmailSender({
    apiKey: "", from: "Patch <recruitment@example.com>",
    client: { emails: { async send(payload) {
      captured = payload;
      return { data: { id: "synthetic-escaping-test" } };
    } } },
  });
  const first = "A&<\"'>";
  const result = await sender.sendOutcome({
    fullName: `${first} Applicant`, email: "synthetic@example.com", decision: "fail",
  });
  assert.deepEqual(result, { ok: true, providerId: "synthetic-escaping-test" });
  assert.ok(captured.text.startsWith(`Hi ${first},\n\n`));
  assert.ok(captured.html.includes("<div>Hi A&amp;&lt;&quot;&#39;&gt;,</div>"));
  assert.equal(captured.html.includes(`<div>Hi ${first},</div>`), false);
  assertCanonicalSignature(captured);
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

test("Invite and Reject create personalised manual drafts without sending or hiding the registration URL", () => {
  let sends = 0;
  const sender = createRecruitmentEmailSender({
    apiKey: "", from: "",
    client: { emails: { async send() { sends += 1; } } },
  });
  const application = { fullName: "Isabella Example", email: "isabella@example.com", decision: "pass" };
  const invited = sender.createTeamEmailDraft(application, "invited");
  assert.equal(invited.to, application.email);
  assert.equal(invited.subject, "Your invitation to join Patch");
  assert.match(invited.body, /^Dear Isabella,/);
  assert.match(invited.body, /six-month internship/);
  assert.match(invited.body, /Title: Legal Speaking Coach\nEmployment type: Internship/);
  assert.match(invited.body, /Important: Please complete your registration now:\nhttps:\/\/www\.patch\.app\/coach-registration\//);
  assert.equal(invited.body.match(/https:\/\/www\.patch\.app\/coach-registration\//g)?.length, 1);
  assert.doesNotMatch(invited.body, /\[[^\]]+\]\(|<a\b|37%|ranked #1|top 8|Patrick Beattie|Founder \| CEO/);
  assert.ok(invited.body.endsWith("Kind regards,"), "the mail application's configured signature is not duplicated");
  const rejected = sender.createTeamEmailDraft(application, "rejected");
  assert.equal(rejected.to, application.email);
  assert.equal(rejected.subject, "Your Patch application");
  assert.match(rejected.body, /^Hi Isabella,/);
  assert.match(rejected.body, /red flags we discussed before the interview/);
  assert.match(rejected.body, /apply again next month/);
  assert.match(rejected.body, /Thanks again, Isabella, and I hope to hear from you soon\./);
  assert.doesNotMatch(rejected.body, /Stage One|Stage 1|coach-registration|Patrick Beattie|Founder \| CEO/);
  assert.ok(rejected.body.endsWith("Best wishes,"), "the mail application's configured signature is not duplicated");
  assert.equal(sends, 0);
});

test("team drafts reject invalid recipients and unsupported actions", () => {
  const sender = createRecruitmentEmailSender({ apiKey: "", from: "" });
  for (const email of ["", "not-an-email", "a@example.com\nBcc:other@example.com", "a@example.com other@example.com"]) {
    assert.equal(sender.createTeamEmailDraft({ fullName: "Synthetic", email }, "invited"), null);
  }
  for (const decision of ["pass", "fail", "", null, {}, ["invited"]]) {
    assert.equal(sender.createTeamEmailDraft({ email: "synthetic@example.com" }, decision), null);
  }
});
