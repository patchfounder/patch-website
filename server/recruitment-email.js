const DEFAULT_BOOKING_URL = "https://www.patch.app/coaching";

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
        "We’d like to invite you to a 30-minute video interview with Patrick, our founder. We’ll discuss the role, your availability and give you time to ask questions.",
        "",
        "Book your interview",
        bookingUrl,
        "",
        "We look forward to meeting you.",
        "",
        "Patrick",
        "Founder, Patch",
      ].join("\n"),
      html: `
        <p>Hi ${escapeHtml(name)},</p>
        <p>Congratulations—you’ve passed Stage One of your application to become a Legal Speaking Coach at Patch.</p>
        <p>We’d like to invite you to a 30-minute video interview with Patrick, our founder. We’ll discuss the role, your availability and give you time to ask questions.</p>
        <p><a href="${escapeHtml(bookingUrl)}">Book your interview</a></p>
        <p>We look forward to meeting you.</p>
        <p>Patrick<br>Founder, Patch</p>
      `,
    };
  }
  return {
    subject: "Your Patch application",
    text: [
      `Hi ${name},`,
      "",
      "Thank you for taking the time to apply for the Legal Speaking Coach internship and send us your voice note.",
      "",
      "After reviewing your application, we won’t be inviting you to Stage Two on this occasion.",
      "",
      "We appreciate your interest in Patch and wish you every success with your next steps.",
      "",
      "Patrick",
      "Founder, Patch",
    ].join("\n"),
    html: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for taking the time to apply for the Legal Speaking Coach internship and send us your voice note.</p>
      <p>After reviewing your application, we won’t be inviting you to Stage Two on this occasion.</p>
      <p>We appreciate your interest in Patch and wish you every success with your next steps.</p>
      <p>Patrick<br>Founder, Patch</p>
    `,
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

  async function sendOutcome(application) {
    if (!application || !["pass", "fail"].includes(application.decision)) {
      return { ok: false, error: "Application outcome is invalid." };
    }
    if (!from) {
      return { ok: false, error: "RECRUITMENT_EMAIL_FROM is not configured." };
    }
    try {
      const resend = await getClient();
      if (!resend?.emails?.send) {
        return { ok: false, error: "RESEND_API_KEY is not configured." };
      }
      const content = outcomeContent(application, bookingUrl);
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
    sendOutcome,
  });
}
