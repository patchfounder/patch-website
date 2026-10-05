import { readFileSync } from "node:fs";

const DEFAULT_BOOKING_URL = "https://www.patch.app/coaching";
const EMAIL_TEXT_STYLE = "font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:400;line-height:20px;";
const PATRICK_SIGNATURE_HTML = readFileSync(
  new URL("./patrick-email-signature.html", import.meta.url),
  "utf8",
);
const PATRICK_SIGNATURE_TEXT = [
  "Patrick Beattie",
  "Founder | CEO",
  "",
  "Patch App LLC",
  "447 Broadway, 2nd Floor",
  "New York, NY 10013, United States",
  "Mobile: +1 904 983 7147",
  "www.patch.app",
].join("\n");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function firstName(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "there";
}

function outcomeHtml(paragraphs) {
  return `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;${EMAIL_TEXT_STYLE}">
    <tr><td style="padding:0;color:#222222;${EMAIL_TEXT_STYLE}">
      ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;${EMAIL_TEXT_STYLE}">${paragraph}</p>`).join("\n")}
      ${PATRICK_SIGNATURE_HTML}
    </td></tr>
  </table>`;
}

function outcomeContent(application, bookingUrl) {
  const name = firstName(application.fullName);
  if (application.decision === "pass") {
    return {
      subject: "You’ve passed Stage One | Patch",
      text: [
        `Hi ${name},`,
        "",
        "Congratulations—you’ve passed Stage One of your application to become a Legal Speaking Coach at Patch.",
        "",
        "I’d like to invite you to a 30-minute video interview. We’ll discuss the role, your availability and give you time to ask questions.",
        "",
        "Book your interview",
        bookingUrl,
        "",
        "I look forward to meeting you.",
        "",
        PATRICK_SIGNATURE_TEXT,
      ].join("\n"),
      html: outcomeHtml([
        `Hi ${escapeHtml(name)},`,
        "Congratulations—you’ve passed Stage One of your application to become a Legal Speaking Coach at Patch.",
        "I’d like to invite you to a 30-minute video interview. We’ll discuss the role, your availability and give you time to ask questions.",
        `<a href="${escapeHtml(bookingUrl)}" style="color:#008299;text-decoration:underline;${EMAIL_TEXT_STYLE}">Book your interview</a>`,
        "I look forward to meeting you.",
      ]),
    };
  }
  return {
    subject: "Your Patch application",
    text: [
      `Hi ${name},`,
      "",
      "Thank you for taking the time to apply for the Legal Speaking Coach internship and send me your voice note.",
      "",
      "After reviewing your application, I won’t be inviting you to an interview on this occasion.",
      "",
      "I appreciate your interest in Patch and wish you every success with your next steps.",
      "",
      PATRICK_SIGNATURE_TEXT,
    ].join("\n"),
    html: outcomeHtml([
      `Hi ${escapeHtml(name)},`,
      "Thank you for taking the time to apply for the Legal Speaking Coach internship and send me your voice note.",
      "After reviewing your application, I won’t be inviting you to an interview on this occasion.",
      "I appreciate your interest in Patch and wish you every success with your next steps.",
    ]),
  };
}

function safeEmailError(error) {
  return String(error?.message || error?.name || error || "Outcome email failed.").slice(0, 1000);
}

export function createRecruitmentEmailSender(options = {}) {
  const apiKey = String(options.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
  const from = String(options.from ?? process.env.RECRUITMENT_EMAIL_FROM ?? "").trim();
  const replyTo = String(options.replyTo ?? process.env.RECRUITMENT_EMAIL_REPLY_TO ?? "").trim();
  const bookingUrl = String(
    options.bookingUrl ?? process.env.RECRUITMENT_BOOKING_URL ?? DEFAULT_BOOKING_URL,
  ).trim();
  let client = options.client || null;

  async function getClient() {
    if (client) return client;
    if (!apiKey) return null;
    const { Resend } = await import("resend");
    client = new Resend(apiKey);
    return client;
  }

  function createPassEmailDraft(application) {
    const recipient = String(application?.email || "").trim();
    if (!application || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return null;
    const content = outcomeContent({ ...application, decision: "pass" }, bookingUrl);
    const body = content.text.slice(0, -PATRICK_SIGNATURE_TEXT.length).trimEnd();
    return Object.freeze({
      to: recipient,
      subject: content.subject,
      body: `${body}\n\nKind regards,`,
    });
  }

  async function sendOutcome(application) {
    if (!application || !["pass", "fail"].includes(application.decision)) {
      return { ok: false, error: "Application outcome is invalid." };
    }
    if (application.decision === "pass") {
      return { ok: false, error: "Pass invitations are prepared in the reviewer's mail app." };
    }
    if (!from) {
      return { ok: false, error: "RECRUITMENT_EMAIL_FROM is not configured." };
    }
    try {
      const content = outcomeContent(application, bookingUrl);
      const resend = await getClient();
      if (!resend?.emails?.send) {
        return { ok: false, error: "RESEND_API_KEY is not configured." };
      }
      const payload = {
        from,
        to: [application.email],
        subject: content.subject,
        text: content.text,
        html: content.html,
      };
      if (replyTo) payload.replyTo = replyTo;

      // Deliberately one provider call. Callers persist the attempt before entering here
      // and must never invoke this method again for the same decided application.
      const response = await resend.emails.send(payload);
      if (response?.error) {
        return { ok: false, error: safeEmailError(response.error) };
      }
      const providerId = String(response?.data?.id || response?.id || "").trim();
      if (!providerId) {
        return { ok: false, error: "Resend did not return a message identifier." };
      }
      return { ok: true, providerId };
    } catch (error) {
      return { ok: false, error: safeEmailError(error) };
    }
  }

  return Object.freeze({
    configured: Boolean(from && (client || apiKey)),
    createPassEmailDraft,
    sendOutcome,
  });
}
