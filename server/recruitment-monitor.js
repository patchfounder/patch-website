import { createHash, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["all", "pending", "pass", "fail", "invited", "rejected"]);
const FIELDS = [
  "applicationId", "cohortId", "cohortMonth", "fullName", "linkedinUrl", "submittedAt",
  "decision", "reviewedAt", "teamDecision", "teamDecidedAt", "emailStatus", "emailAttemptedAt",
  "emailAttemptCount", "audioDurationSeconds", "audioMimeType", "audioFileSize",
];

function invalid(message = "Invalid recruitment monitor request.") {
  return Object.assign(new Error(message), { statusCode: 400, code: "invalid_monitor_request" });
}

export function validateRecruitmentMonitorToken(value) {
  const token = String(value ?? "");
  if (token && !/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    throw new Error("RECRUITMENT_MONITOR_READ_TOKEN must contain 32 to 256 URL-safe characters.");
  }
  return token;
}

function authorised(header, token) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(String(header || ""));
  if (!token || !match) return false;
  const digest = (text) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(match[1]), digest(token));
}

function applicationId(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw invalid("Use an exact application ID.");
  return value;
}

function project(application, includeEmail = false) {
  if (!application) throw Object.assign(new Error("Application not found."), {
    code: "application_missing", statusCode: 404,
  });
  return {
    ...Object.fromEntries(FIELDS.map((field) => [field, application[field] ?? ""])),
    ...(includeEmail ? { email: application.email } : {}),
    reviewPath: "/assessment",
  };
}

function parseSelection(input) {
  const allowed = new Set(["limit", "cursor", "status", "cohortId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw invalid();
  if (Object.values(input).some((value) => typeof value !== "string")) throw invalid();
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (input.limit !== undefined && !/^[1-9]\d{0,2}$/.test(input.limit)) throw invalid("Limit must be 1 to 100.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid("Limit must be 1 to 100.");
  const status = input.status ?? "all";
  if (!STATUSES.has(status)) throw invalid("Unknown application status.");
  const cohortId = input.cohortId === undefined ? "" : applicationId(input.cohortId);
  let after = null;
  if (input.cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,1024}$/.test(input.cursor)) throw invalid("Invalid pagination cursor.");
    let cursor;
    try { cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")); } catch { throw invalid("Invalid pagination cursor."); }
    if (!cursor || cursor.v !== 1 || cursor.status !== status || cursor.cohortId !== cohortId
      || typeof cursor.submittedAt !== "string" || !Number.isFinite(Date.parse(cursor.submittedAt))
      || new Date(cursor.submittedAt).toISOString() !== cursor.submittedAt
      || !UUID.test(String(cursor.applicationId || ""))) throw invalid("Invalid pagination cursor.");
    after = { submittedAt: cursor.submittedAt, applicationId: cursor.applicationId };
  }
  return { limit, status, cohortId, after };
}

export function createRecruitmentMonitor({ database, service, now = () => new Date() }) {
  return Object.freeze({
    list(query = {}) {
      const { limit, ...selection } = parseSelection(query);
      const rows = database.listMonitoringApplications({ ...selection, limit: limit + 1 });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor = hasMore ? Buffer.from(JSON.stringify({
        v: 1, status: selection.status, cohortId: selection.cohortId,
        submittedAt: last.submittedAt, applicationId: last.applicationId,
      })).toString("base64url") : null;
      const instant = new Date(now());
      if (!Number.isFinite(instant.getTime())) throw new Error("Invalid monitor clock.");
      return {
        ok: true, applications: page.map((row) => project(row)), nextCursor, hasMore,
        totals: database.readMonitoringTotals(selection), observedAt: instant.toISOString(),
      };
    },
    read(id) { return { ok: true, application: project(database.getApplication(applicationId(id)), true) }; },
    audio(id) { return service.getReviewerAudio(applicationId(id)); },
  });
}

export function mountRecruitmentMonitorRoutes(app, { token: rawToken, monitor, streamAudio }) {
  const token = validateRecruitmentMonitorToken(rawToken);
  const prefix = "/api/recruitment/monitor";
  app.use(prefix, (req, res, next) => {
    res.set({ "Cache-Control": "private, no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" });
    if (!token || !monitor) return res.status(503).json({ ok: false, code: "monitor_unavailable", message: "Recruitment monitoring is not configured." });
    if (!authorised(req.headers.authorization, token)) return res.status(401).json({ ok: false, code: "monitor_access_denied", message: "Recruitment monitor access denied." });
    if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).set("Allow", "GET, HEAD").json({ ok: false, code: "monitor_read_only", message: "Recruitment monitoring is read-only." });
    return next();
  });
  const readRoute = (handler) => (req, res) => {
    try { return handler(req, res); } catch (error) {
      const status = error.statusCode === 400 || error.statusCode === 404 ? error.statusCode : 503;
      return res.status(status).json({ ok: false, code: status === 503 ? "monitor_read_failed" : error.code,
        message: status === 503 ? "Recruitment monitoring is temporarily unavailable." : error.message });
    }
  };
  app.get(`${prefix}/applications`, readRoute((req, res) => res.json(monitor.list(req.query))));
  app.get(`${prefix}/applications/:applicationId`, readRoute((req, res) => res.json(monitor.read(req.params.applicationId))));
  app.get(`${prefix}/applications/:applicationId/audio`, readRoute((req, res) => streamAudio(req, res, monitor.audio(req.params.applicationId))));
  app.use(prefix, (_req, res) => res.status(404).json({ ok: false, code: "monitor_route_missing", message: "Recruitment monitor route not found." }));
}
