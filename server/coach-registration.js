import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isIP } from "node:net";
import { DatabaseSync } from "node:sqlite";

import { createCoachContactCard } from "./coach-registration-vcf.js";

const PHOTO_LIMIT = 1024 * 1024;
const RECIPIENT = "patrick@patch.app";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const FIELD_NAMES = ["requestId", "firstName", "surname", "email", "phone", "linkedin", "availability"];
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

class RegistrationError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    Object.assign(this, { statusCode, code, details });
  }
}

function invalid(message) {
  throw new RegistrationError(400, "invalid_registration", message);
}

function textField(value, label, max) {
  if (typeof value !== "string") invalid(`${label} is required.`);
  const result = value.trim();
  if (!result || result.length > max || /[\x00-\x1f\x7f]/.test(result)) invalid(`${label} is invalid.`);
  return result;
}

function minutes(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid("Choose valid availability times.");
  const result = Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (result < 360 || result > 1320 || result % 15) invalid("Choose availability between 06:00 and 22:00 in 15-minute steps.");
  return result;
}

function normalizeAvailability(value) {
  let input;
  try { input = JSON.parse(value); } catch { invalid("Choose your weekly availability."); }
  if (!Array.isArray(input) || input.length > 5) invalid("Choose your weekly availability.");
  const days = new Map();
  let slotCount = 0;
  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some((key) => !["day", "slots"].includes(key))
      || !DAYS.includes(entry.day) || days.has(entry.day)
      || !Array.isArray(entry.slots) || entry.slots.length > 3) invalid("Choose valid weekday availability.");
    const slots = entry.slots.map((slot) => {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)
        || Object.keys(slot).some((key) => !["start", "end"].includes(key))) invalid("Choose valid availability ranges.");
      const start = minutes(slot.start);
      const end = minutes(slot.end);
      if (end - start < 15) invalid("Each availability range must be at least 15 minutes.");
      return { start: slot.start, end: slot.end };
    }).sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 1; index < slots.length; index += 1) {
      if (minutes(slots[index].start) - minutes(slots[index - 1].end) < 15) invalid("Leave at least 15 minutes between availability ranges.");
    }
    slotCount += slots.length;
    days.set(entry.day, slots);
  }
  if (!slotCount) invalid("Choose at least one availability range.");
  return DAYS.filter((day) => days.get(day)?.length).map((day) => ({ day, slots: days.get(day) }));
}

function normalizeRegistration(body, file) {
  if (!body || Object.keys(body).some((key) => !FIELD_NAMES.includes(key))) invalid("The registration contains unsupported fields.");
  const requestId = textField(body.requestId, "Registration reference", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(requestId)) invalid("The registration reference is invalid.");
  const firstName = textField(body.firstName, "First name", 120);
  const surname = textField(body.surname, "Surname", 120);
  const email = textField(body.email, "Email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("Enter a valid email address.");
  const phone = textField(body.phone, "WhatsApp number", 60);
  let linkedin = textField(body.linkedin, "Profile URL", 2048);
  if (/^www\./i.test(linkedin)) linkedin = `https://${linkedin}`;
  try {
    const url = new URL(linkedin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) invalid("Enter a valid profile URL.");
    linkedin = url.href;
  } catch { invalid("Enter a valid profile URL."); }
  const availability = normalizeAvailability(body.availability);
  let photo = null;
  if (file) {
    const buffer = file.buffer;
    const png = Buffer.isBuffer(buffer) && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = Buffer.isBuffer(buffer) && buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!buffer?.length || buffer.length > PHOTO_LIMIT
      || !((file.mimetype === "image/png" && png) || (file.mimetype === "image/jpeg" && jpeg))) invalid("Choose a JPG or PNG photo up to 1 MB.");
    photo = { buffer, mimeType: file.mimetype };
  }
  const profile = { requestId, firstName, surname, email, phone, linkedin, availability };
  const photoDigest = photo ? createHash("sha256").update(photo.buffer).digest("hex") : "";
  const digest = createHash("sha256").update(JSON.stringify({ ...profile, photoType: photo?.mimeType || "", photoDigest })).digest("hex");
  return { profile, photo, digest };
}

function backendUrl(value, production) {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && (production || url.protocol !== "http:" || !loopback))
      || url.username || url.password || url.search || url.hash
      || url.pathname !== "/api/integrations/coach-registration") return "";
    return url.href;
  } catch { return ""; }
}

function originUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch { return ""; }
}

function privateDatabasePath(dataRoot, production, override) {
  if (override === ":memory:") {
    if (production) throw new Error("Registration receipts require private persistent storage in production.");
    return override;
  }
  if (!dataRoot || !path.isAbsolute(dataRoot)) throw new Error("A private absolute registration data root is required.");
  const root = path.resolve(dataRoot);
  if (production && root !== "/data/recruitment") throw new Error("Registration receipts must use the existing Website private volume.");
  if (!production) {
    const relative = path.relative(path.resolve(tmpdir()), root);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Registration test storage must be inside the temporary directory.");
  }
  // Resolve the existing parent before creating anything to reject unsafe symlinks.
  let ancestor = root;
  const missing = [];
  while (!existsSync(ancestor)) { missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  const resolved = path.join(realpathSync(ancestor), ...missing);
  if (production ? resolved !== "/data/recruitment" : !resolved.startsWith(`${realpathSync(tmpdir())}${path.sep}`)) throw new Error("Registration storage resolves outside the private storage boundary.");
  mkdirSync(resolved, { recursive: true, mode: 0o700 });
  chmodSync(resolved, 0o700);
  const databasePath = path.join(resolved, "coach-registration.sqlite");
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(file) && realpathSync(file) !== file) throw new Error("Registration receipt storage must not be a symlink.");
  }
  return databasePath;
}

function noStore(res) {
  res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
}

function privateProxyPeer(value) {
  const address = String(value || "").toLowerCase().replace(/^::ffff:/, "");
  if (isIP(address) === 4) {
    const [first, second] = address.split(".").map(Number);
    return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  return isIP(address) === 6 && (address === "::1" || /^f[cd]/.test(address) || /^fe[89ab]/.test(address));
}

function clientAddress(req, env) {
  const peer = String(req.socket.remoteAddress || "unknown");
  const railway = env.NODE_ENV === "production" && env.RAILWAY_SERVICE_ID && env.RAILWAY_ENVIRONMENT_ID;
  if (railway && privateProxyPeer(peer)) {
    // Only the nearest trusted Railway proxy's appended value is considered;
    // a client-supplied leftmost prefix cannot choose its rate-limit identity.
    const forwarded = String(req.get("X-Forwarded-For") || "").split(",").at(-1).trim();
    if (isIP(forwarded)) return forwarded;
  }
  return peer;
}

export function createCoachRegistrationRuntime(options = {}) {
  const env = options.env || process.env;
  const production = env.NODE_ENV === "production";
  const destination = backendUrl(String(env.COACH_REGISTRATION_BACKEND_URL || ""), production);
  const secret = String(env.COACH_REGISTRATION_SECRET || "");
  const from = String(env.COACH_REGISTRATION_EMAIL_FROM || env.RECRUITMENT_EMAIL_FROM || "").trim();
  const replyTo = String(env.COACH_REGISTRATION_EMAIL_REPLY_TO || env.RECRUITMENT_EMAIL_REPLY_TO || "").trim();
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const origin = originUrl(String(env.COACH_REGISTRATION_PUBLIC_ORIGIN || env.RECRUITMENT_PUBLIC_ORIGIN || "https://www.patch.app"));
  const configured = Boolean(destination && Buffer.byteLength(secret) >= 32 && from
    && (apiKey || typeof options.emailClient?.emails?.send === "function") && origin
    && (!production || origin.startsWith("https://")));
  const configurationStatus = Object.freeze({ ready: configured, message: configured ? "Registration is available." : "Coach registration is temporarily unavailable. Please try again later." });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  let emailClient = options.emailClient || null;
  let database = null;
  const inFlight = new Map();
  const rateLimits = new Map();

  function receiptDatabase() {
    if (database) return database;
    const databasePath = privateDatabasePath(options.dataRoot, production, options.databasePath);
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
    database.exec(`CREATE TABLE IF NOT EXISTS coach_registration_receipts (
      request_id TEXT PRIMARY KEY NOT NULL, digest TEXT NOT NULL,
      coach_id TEXT, profile_id TEXT, email_provider_id TEXT,
      email_attempted_at INTEGER, completed_at INTEGER
    ) STRICT;`);
    if (databasePath !== ":memory:") {
      for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
    }
    return database;
  }

  async function getEmailClient() {
    if (!emailClient) {
      const { Resend } = await import("resend");
      emailClient = new Resend(apiKey);
    }
    return emailClient;
  }

  async function register({ profile, photo, digest }) {
    const db = receiptDatabase();
    db.prepare("INSERT OR IGNORE INTO coach_registration_receipts (request_id, digest) VALUES (?, ?)").run(profile.requestId, digest);
    let receipt = db.prepare("SELECT * FROM coach_registration_receipts WHERE request_id = ?").get(profile.requestId);
    if (receipt.digest !== digest) throw new RegistrationError(409, "registration_conflict", "This registration reference has already been used with different details. Keep the original details when retrying.");
    if (receipt.completed_at !== null) return { ok: true, status: "registered", coachId: receipt.coach_id };
    if (!receipt.coach_id) {
      let response;
      try {
        response = await fetchImpl(destination, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(profile),
        });
      } catch {
        throw new RegistrationError(503, "registration_retry", "We could not confirm account creation. Keep this page open and retry with the same details. Do not start a new registration.");
      }
      if (response.status === 409) throw new RegistrationError(409, "registration_conflict", "This registration reference is already in use. Keep this page open and contact Patch before starting a new registration.");
      if (!response.ok) throw new RegistrationError(503, "registration_retry", "We could not confirm account creation. Keep this page open and retry with the same details. Do not start a new registration.");
      let result;
      try { result = await response.json(); } catch { /* Use the safe uncertain response below. */ }
      if (!result || !["created", "already-created"].includes(result.status)
        || typeof result.coachId !== "string" || !/^C\d+$/.test(result.coachId)
        || typeof result.profileId !== "string" || !result.profileId || result.profileId.length > 200
        || result.workingTimeZone !== "Europe/London") {
        throw new RegistrationError(503, "registration_retry", "We could not confirm account creation. Keep this page open and retry with the same details. Do not start a new registration.");
      }
      db.prepare("UPDATE coach_registration_receipts SET coach_id = ?, profile_id = ? WHERE request_id = ?").run(result.coachId, result.profileId, profile.requestId);
      receipt = db.prepare("SELECT * FROM coach_registration_receipts WHERE request_id = ?").get(profile.requestId);
    }
    if (receipt.email_attempted_at !== null && Number(now()) - receipt.email_attempted_at >= RETRY_WINDOW_MS) {
      throw new RegistrationError(503, "registration_email_pending", "Your Coach account was created, but we could not confirm Patrick's email. Please contact Patch with this registration reference. Do not register again.", { accountCreated: true, coachId: receipt.coach_id });
    }
    const card = createCoachContactCard(profile, photo);
    const availabilityText = profile.availability.map(({ day, slots }) => `${day}: ${slots.map(({ start, end }) => `${start}–${end}`).join(", ")}`).join("\n");
    const payload = {
      from, to: [RECIPIENT], subject: "New Patch Coach registration",
      text: [
        `${profile.firstName} ${profile.surname} has created a Patch Coach account.`,
        "", `Coach ID: ${receipt.coach_id}`, `Email: ${profile.email}`, `WhatsApp number: ${profile.phone}`, `Profile: ${profile.linkedin}`,
        "", "Weekly availability (Europe/London):", availabilityText,
        "", "The Apple-compatible contact card is attached. Any supplied photo is included only in that contact card, not the Patch profile.",
      ].join("\n"),
      attachments: [{ filename: card.filename, content: card.content.toString("base64"), contentType: card.contentType }],
    };
    if (replyTo) payload.replyTo = replyTo;
    if (receipt.email_attempted_at === null) db.prepare("UPDATE coach_registration_receipts SET email_attempted_at = ? WHERE request_id = ?").run(Number(now()), profile.requestId);
    let providerId = "";
    try {
      const client = await getEmailClient();
      const response = await client.emails.send(payload, {
        idempotencyKey: `coach-registration/${profile.requestId}`, signal: AbortSignal.timeout(20_000),
      });
      if (!response?.error) providerId = String(response?.data?.id || response?.id || "").trim();
    } catch { /* Never expose provider errors, credentials, or contact details. */ }
    if (!providerId || providerId.length > 200) throw new RegistrationError(503, "registration_email_pending", "Your Coach account was created, but Patrick's confirmation email has not been confirmed. Keep this page open and retry with the same details. Do not register again.", { accountCreated: true, coachId: receipt.coach_id });
    db.prepare("UPDATE coach_registration_receipts SET email_provider_id = ?, completed_at = ? WHERE request_id = ?").run(providerId, Number(now()), profile.requestId);
    return { ok: true, status: "registered", coachId: receipt.coach_id };
  }

  function serialRegister(input) {
    const key = input.profile.requestId;
    const current = inFlight.get(key);
    const promise = (current ? current.catch(() => {}) : Promise.resolve()).then(() => register(input));
    inFlight.set(key, promise);
    promise.finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); }).catch(() => {});
    return promise;
  }

  function localFailureDetails(req) {
    const requestId = req.body?.requestId;
    // A rejected retry can still belong to an account created by an earlier,
    // uncertain attempt. Never unlock that registration on local validation.
    if (typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(requestId)) return { accountCreated: false };
    try {
      const prior = receiptDatabase().prepare("SELECT request_id FROM coach_registration_receipts WHERE request_id = ?").get(requestId);
      return prior ? {} : { accountCreated: false };
    } catch {
      return {};
    }
  }

  function mount(app, { express, multer }) {
    if (!app || !express || !multer) throw new Error("Express and Multer are required for Coach registration.");
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_LIMIT, files: 1, fields: 7, parts: 9, fieldSize: 16 * 1024, fieldNameSize: 100 } }).single("photo");
    app.get("/api/coach-registration/status", (_req, res) => { noStore(res); res.json(configurationStatus); });
    app.post("/api/coach-registration", (req, res, next) => {
      noStore(res);
      if (!configured) return res.status(503).json({ ok: false, code: "registration_unavailable", message: configurationStatus.message });
      if (req.get("Origin") !== origin || ["cross-site", "none"].includes(req.get("Sec-Fetch-Site"))) return res.status(403).json({ ok: false, code: "registration_origin", message: "Open the registration page on the Patch website and try again." });
      if (!req.is("multipart/form-data")) return res.status(415).json({ ok: false, code: "registration_form_required", message: "Use the registration form to submit your details." });
      if (Number(req.get("Content-Length") || 0) > PHOTO_LIMIT + 128 * 1024) return res.status(413).json({ ok: false, code: "registration_too_large", message: "Choose a photo up to 1 MB." });
      const time = Number(now());
      for (const [key, value] of rateLimits) if (value.expires <= time) rateLimits.delete(key);
      const address = clientAddress(req, env);
      let rate = rateLimits.get(address);
      if (!rate) {
        if (rateLimits.size >= 1000) return res.status(429).json({ ok: false, code: "registration_rate_limit", message: "Please wait a few minutes before retrying the same registration." });
        rate = { count: 0, expires: time + 10 * 60_000 };
        rateLimits.set(address, rate);
      }
      if (++rate.count > 12) {
        res.set("Retry-After", String(Math.ceil((rate.expires - time) / 1000)));
        return res.status(429).json({ ok: false, code: "registration_rate_limit", message: "Please wait a few minutes before retrying the same registration." });
      }
      return next();
    }, upload, (req, res, next) => {
      Promise.resolve().then(() => normalizeRegistration(req.body, req.file)).then(serialRegister)
        .then((result) => res.status(200).json(result)).catch(next)
        .finally(() => { if (req.file) req.file.buffer = null; req.body = null; });
    }, (error, req, res, _next) => {
      const localDetails = error?.code === "invalid_registration" || error?.name === "MulterError" ? localFailureDetails(req) : {};
      if (req.file) req.file.buffer = null;
      req.body = null;
      if (error instanceof RegistrationError) return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message, ...localDetails, ...error.details });
      if (error?.name === "MulterError") return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ ok: false, code: "registration_upload", message: "Use the registration form and choose a JPG or PNG photo up to 1 MB.", ...localDetails });
      return res.status(503).json({ ok: false, code: "registration_retry", message: "Registration could not be confirmed. Keep this page open and retry with the same details. Do not start a new registration." });
    });
  }

  return Object.freeze({ configured, configurationStatus, mount, close() { if (database) database.close(); database = null; } });
}
