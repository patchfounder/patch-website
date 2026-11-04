import { readFileSync } from "node:fs";

const DEFAULT_BOOKING_URL = "https://www.patch.app/coaching";
const COACH_REGISTRATION_URL = "https://www.patch.app/coach-registration/";
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
  const [greeting, ...body] = paragraphs;
  return `<div data-email-content dir="ltr" style="overflow-wrap:anywhere;word-break:break-word;">
  <!-- PATCH_CONTENT_START -->
  <div>${greeting}</div>
  <div><br></div>
  ${body.map((paragraph) => `<div>${paragraph}</div>`).join("\n<div><br></div>\n")}
  <div><br></div>
  <div>Kind regards,</div>
  <div>Patrick</div>
  <div><br></div>
  ${PATRICK_SIGNATURE_HTML}
  <!-- PATCH_CONTENT_END -->
</div>
`;
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
      "Thank you for your interest in Patch and for taking the time to submit your recording.",
      "",
      "Unfortunately, your application has not been selected for the next stage on this occasion.",
      "",
      "Thank you again for the time and effort put into your application, and best wishes for the future.",
      "",
      "Kind regards,",
      "Patrick",
      "",
      PATRICK_SIGNATURE_TEXT,
    ].join("\n"),
    html: outcomeHtml([
      `Hi ${escapeHtml(name)},`,
      "Thank you for your interest in Patch and for taking the time to submit your recording.",
      "Unfortunately, your application has not been selected for the next stage on this occasion.",
      "Thank you again for the time and effort put into your application, and best wishes for the future.",
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

  function createTeamEmailDraft(application, decision) {
    const recipient = String(application?.email || "").trim();
    if (!application || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return null;
    if (!["rejected", "invited"].includes(decision)) return null;
    const name = firstName(application.fullName);
    const paragraphs = decision === "invited"
      ? [
          `Dear ${name},`,
          "I am pleased to invite you to join the team at Patch as a Legal Speaking Coach. We help lawyers who carry out global transactions develop a confident, professional speaking voice so that they can demonstrate excellence to their clients.",
          "The six-month internship involves supporting lawyers in the role of Legal Speaking Coach. You will be trained to deliver specialist coaching using our exclusive system and work with legal professionals from firms including Ashurst, Pinsent Masons, Clifford Chance and Dentons.",
          "You may use the following details when adding your new position to LinkedIn:",
          [
            "Title: Legal Speaking Coach",
            "Employment type: Internship",
            "Company name: Patch App",
            "Location: London",
            "Industry: E-learning",
            "Description: Legal Speaking Coach at Patch App. We are an exclusive platform for lawyers, working with global law firms to deliver one-to-one speaking sessions.",
          ].join("\n"),
          `Important: Please complete your registration now:\n${COACH_REGISTRATION_URL}`,
          "Once you have registered, please review the training video and download the Patch Call script before your first call.",
          "I look forward to welcoming you to the team.",
          "Kind regards,",
        ]
      : [
          `Hi ${name},`,
          "Thanks so much for taking the time to interview. It was lovely getting to know you, and I really appreciate your interest in Patch.",
          "A couple of the red flags we discussed before the interview came up during our conversation, so unfortunately I’m unable to move forward with your application this time.",
          "You’re very welcome to apply again next month. With some work on those areas, you could be in a stronger position.",
          `Thanks again, ${name}, and I hope to hear from you soon.`,
          "Best wishes,",
        ];
    // Match the existing manual Pass workflow: the reviewer's mail application
    // supplies Patrick's configured signature, avoiding a duplicated signature.
    // All URLs in the plain-text draft remain fully visible, never masked labels.
    return Object.freeze({
      to: recipient,
      subject: decision === "invited" ? "Your invitation to join Patch" : "Your Patch application",
      body: paragraphs.join("\n\n"),
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
    createTeamEmailDraft,
    sendOutcome,
  });
}
