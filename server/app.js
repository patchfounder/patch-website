import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICANT_COOKIE_NAME,
  REVIEWER_COOKIE_NAME,
  bearerTokenMatches,
  clearCookie,
  createSignedCookieCodec,
  parseCookieHeader,
  serializeCookie,
  validateReviewerSecret,
} from "./recruitment-access.js";
import { inspectRecruitmentAudio } from "./recruitment-audio.js";
import { createRecruitmentDatabase } from "./recruitment-db.js";
import { createRecruitmentEmailSender } from "./recruitment-email.js";
import { createRecruitmentService } from "./recruitment-service.js";
import {
  createRecruitmentStorage,
  DEFAULT_MAX_AUDIO_BYTES,
  resolveRecruitmentDataRoot,
} from "./recruitment-storage.js";

const DEFAULT_REVIEWER_SESSION_MINUTES = 20;

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function noStore(res) {
  res.set({
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
  });
}

function nonNegativeCount(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : fallback;
}

function reviewerTotals(controls, queue, history) {
  const pendingTotal = nonNegativeCount(controls.current?.pendingCount, queue.length);
  const processedCounts = [controls.current?.processedCount, controls.previous?.processedCount]
    .filter((value) => value !== undefined && value !== null && value !== "");
  const processedTotal = processedCounts.length
    ? processedCounts.reduce((total, value) => total + nonNegativeCount(value), 0)
    : history.length;
  return { pendingTotal, processedTotal };
}

function cookiePayload(req, cookieName, cookieCodec) {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookieCodec.unseal(cookies[cookieName]);
}

function safeReviewerSessionMinutes(value) {
  const minutes = Number(value || DEFAULT_REVIEWER_SESSION_MINUTES);
  return Number.isFinite(minutes) ? Math.max(5, Math.min(60, Math.floor(minutes))) : DEFAULT_REVIEWER_SESSION_MINUTES;
}

function parseRange(rangeHeader, size) {
  const value = String(rangeHeader || "").trim();
  if (!value) return null;
  if (value.includes(",")) return { invalid: true };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end < start
    || start >= size
  ) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

function streamReviewerAudio(req, res, audio) {
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Content-Type": audio.mimeType,
    "X-Content-Type-Options": "nosniff",
  };
  const range = parseRange(req.headers.range, audio.fileSize);
  if (range?.invalid) {
    res.status(416).set({ ...commonHeaders, "Content-Range": `bytes */${audio.fileSize}` }).end();
    return;
  }
  if (range) {
    res.status(206).set({
      ...commonHeaders,
      "Content-Range": `bytes ${range.start}-${range.end}/${audio.fileSize}`,
      "Content-Length": String(range.end - range.start + 1),
    });
    createReadStream(audio.filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.status(200).set({ ...commonHeaders, "Content-Length": String(audio.fileSize) });
  createReadStream(audio.filePath).pipe(res);
}

function recruitmentErrorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  const multerLimit = error?.code === "LIMIT_FILE_SIZE";
  const statusCode = multerLimit
    ? 413
    : Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;
  const safeOperationalMessage = error?.code === "outcome_email_not_configured";
  const publicMessage = statusCode >= 500 && !safeOperationalMessage
    ? "Recruitment is temporarily unavailable."
    : multerLimit
      ? "The voice recording is too large."
      : String(error?.message || "The request could not be completed.");
  return res.status(statusCode).json({
    ok: false,
    code: multerLimit ? "audio_too_large" : String(error?.code || "recruitment_error"),
    message: publicMessage,
  });
}

export function mountRecruitmentRoutes(app, options) {
  const {
    express,
    multer,
    service,
    cookieCodec,
    reviewerSecret,
    secureCookies = process.env.NODE_ENV === "production",
    reviewerSessionMinutes = DEFAULT_REVIEWER_SESSION_MINUTES,
    maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES,
    staticDirectory = "",
    audioInspector = inspectRecruitmentAudio,
  } = options;
  if (!app || !express || !multer || !service || !cookieCodec) {
    throw new Error("Express, Multer, service, and cookie codec are required.");
  }

  const reviewerTtlMinutes = safeReviewerSessionMinutes(reviewerSessionMinutes);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxAudioBytes,
      files: 1,
      fields: 8,
      fieldSize: 16 * 1024,
    },
  });

  const establishReviewerSession = (res) => {
    const expiresAt = new Date(Date.now() + reviewerTtlMinutes * 60_000);
    const payload = {
      v: 1,
      kind: "reviewer",
      exp: Math.floor(expiresAt.getTime() / 1000),
    };
    res.set("Set-Cookie", serializeCookie(REVIEWER_COOKIE_NAME, cookieCodec.seal(payload), {
      secure: secureCookies,
      expires: expiresAt,
      maxAgeSeconds: reviewerTtlMinutes * 60,
    }));
  };

  app.disable("x-powered-by");
  app.use("/api/recruitment", express.json({ limit: "32kb", strict: true }));

  const requireReviewer = (req, res, next) => {
    const payload = cookiePayload(req, REVIEWER_COOKIE_NAME, cookieCodec);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !payload
      || payload.v !== 1
      || payload.kind !== "reviewer"
      || !Number.isFinite(Number(payload.exp))
      || nowSeconds >= Number(payload.exp)
    ) {
      noStore(res);
      res.set("Set-Cookie", clearCookie(REVIEWER_COOKIE_NAME, { secure: secureCookies }));
      return res.status(401).json({ ok: false, code: "reviewer_session_expired", message: "Reviewer session expired." });
    }
    req.recruitmentReviewer = payload;
    return next();
  };

  const requireApplicant = (req, res, next) => {
    noStore(res);
    const payload = cookiePayload(req, APPLICANT_COOKIE_NAME, cookieCodec);
    try {
      service.validateApplicantSession(payload);
      req.recruitmentApplicantSession = payload;
      return next();
    } catch (error) {
      res.set("Set-Cookie", clearCookie(APPLICANT_COOKIE_NAME, { secure: secureCookies }));
      return next(error);
    }
  };

  app.get("/api/recruitment/health", (req, res) => {
    noStore(res);
    const health = service.healthCheck();
    return res.status(health.ok ? 200 : 503).json(health);
  });

  app.get("/health", (_req, res) => {
    noStore(res);
    const health = service.healthCheck();
    return res.status(health.ok ? 200 : 503).json(health);
  });

  app.get(["/api/recruitment/status", "/api/recruitment/applicant/status"], (req, res) => {
    noStore(res);
    const payload = cookiePayload(req, APPLICANT_COOKIE_NAME, cookieCodec);
    const result = service.getApplicantStatus(payload);
    if (!result.unlocked && parseCookieHeader(req.headers.cookie)[APPLICANT_COOKIE_NAME]) {
      res.set("Set-Cookie", clearCookie(APPLICANT_COOKIE_NAME, { secure: secureCookies }));
    }
    return res.json({ ok: true, ...result });
  });

  app.post(["/api/recruitment/unlock", "/api/recruitment/applicant/unlock"], asyncRoute(async (req, res) => {
    noStore(res);
    const result = await service.unlockApplicant(req.body?.password);
    const nowMs = Date.now();
    res.set("Set-Cookie", serializeCookie(
      APPLICANT_COOKIE_NAME,
      cookieCodec.seal(result.sessionPayload),
      {
        secure: secureCookies,
        expires: result.expiresAt,
        maxAgeSeconds: Math.max(0, Math.floor((result.expiresAt.getTime() - nowMs) / 1000)),
      },
    ));
    return res.json({ ok: true, unlocked: true, state: "open", cohort: result.cohort });
  }));

  app.post(
    ["/api/recruitment/applications", "/api/recruitment/applicant/applications"],
    requireApplicant,
    upload.single("audio"),
    asyncRoute(async (req, res) => {
        noStore(res);
        if (!req.file?.buffer) {
          return res.status(400).json({ ok: false, code: "audio_required", message: "A voice recording is required." });
        }
        const inspectedAudio = await audioInspector(req.file.buffer, req.file.mimetype);
        const result = service.submitApplication({
          sessionPayload: req.recruitmentApplicantSession,
          fullName: req.body?.fullName,
          email: req.body?.email,
          linkedinUrl: req.body?.linkedinUrl ?? req.body?.linkedin,
          // The uploaded container is authoritative; the client value is accepted
          // only as an input-contract field and never used for enforcement/storage.
          audioDurationSeconds: inspectedAudio.durationSeconds,
          audioBuffer: req.file.buffer,
          audioMimeType: req.file.mimetype,
        });
        return res.status(201).json(result);
    }),
  );

  app.post("/api/recruitment/reviewer/session", (req, res) => {
    noStore(res);
    if (!bearerTokenMatches(req.headers.authorization, reviewerSecret)) {
      return res.status(401).json({ ok: false, code: "invalid_reviewer_secret", message: "Reviewer access denied." });
    }
    establishReviewerSession(res);
    return res.redirect(303, "/assessment");
  });

  app.get("/assessment/:reviewerSecret", (req, res) => {
    noStore(res);
    res.set("Referrer-Policy", "no-referrer");
    if (bearerTokenMatches(`Bearer ${req.params.reviewerSecret}`, reviewerSecret)) {
      establishReviewerSession(res);
    } else {
      res.set("Set-Cookie", clearCookie(REVIEWER_COOKIE_NAME, { secure: secureCookies }));
    }
    return res.redirect(303, "/assessment");
  });

  app.post("/api/recruitment/reviewer/logout", requireReviewer, (req, res) => {
    noStore(res);
    res.set("Set-Cookie", clearCookie(REVIEWER_COOKIE_NAME, { secure: secureCookies }));
    return res.status(204).end();
  });

  app.get("/api/recruitment/reviewer/applications", requireReviewer, (req, res) => {
    noStore(res);
    const applications = service.listPendingApplications(req.query.limit);
    const processedApplications = service.listProcessedApplications(req.query.limit);
    const controls = service.listCohortControls();
    return res.json({
      ok: true,
      applications,
      pendingApplications: applications,
      processedApplications,
      ...reviewerTotals(controls, applications, processedApplications),
    });
  });

  app.get("/api/recruitment/reviewer/state", requireReviewer, (req, res) => {
    noStore(res);
    const queue = service.listPendingApplications(req.query.limit);
    const history = service.listProcessedApplications(req.query.limit);
    const controls = service.listCohortControls();
    return res.json({
      ok: true,
      authenticated: true,
      currentCohort: controls.current,
      previousCohort: controls.previous,
      queue,
      current: queue[0] || null,
      history,
      ...reviewerTotals(controls, queue, history),
    });
  });

  app.get("/api/recruitment/reviewer/applications/:applicationId/audio", requireReviewer, (req, res, next) => {
    try {
      const audio = service.getReviewerAudio(req.params.applicationId);
      return streamReviewerAudio(req, res, audio);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/recruitment/reviewer/applications/:applicationId/decision", requireReviewer, asyncRoute(async (req, res) => {
    noStore(res);
    const result = await service.decideApplication(req.params.applicationId, req.body?.decision);
    return res.json({ ok: true, ...result });
  }));

  app.get("/api/recruitment/reviewer/cohorts", requireReviewer, (req, res) => {
    noStore(res);
    const controls = service.listCohortControls();
    return res.json({
      ok: true,
      ...controls,
      cohorts: [controls.current, controls.previous, controls.next].filter(Boolean),
      currentCohort: controls.current,
      previousCohort: controls.previous,
    });
  });

  app.post("/api/recruitment/reviewer/cohorts/next", requireReviewer, asyncRoute(async (req, res) => {
    noStore(res);
    const cohort = await service.createNextCohort(req.body || {});
    return res.status(201).json({ ok: true, cohort });
  }));

  app.post("/api/recruitment/reviewer/cohorts", requireReviewer, asyncRoute(async (req, res) => {
    noStore(res);
    const result = await service.createAndActivateCohort(req.body || {});
    return res.status(201).json({ ok: true, ...result, cohort: result.current });
  }));

  app.delete("/api/recruitment/reviewer/cohorts/:cohortId", requireReviewer, (req, res, next) => {
    try {
      noStore(res);
      if (req.body?.confirm !== true) {
        return res.status(400).json({
          ok: false,
          code: "cohort_deletion_confirmation_required",
          message: "Confirm removal of the active application window.",
        });
      }
      return res.json({ ok: true, ...service.deleteCurrentCohort(req.params.cohortId) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/recruitment/reviewer/cohorts/activate-next", requireReviewer, (req, res, next) => {
    try {
      noStore(res);
      if (req.body?.confirm !== true) {
        return res.status(400).json({
          ok: false,
          code: "cohort_activation_confirmation_required",
          message: "Confirm activation of the prepared application window.",
        });
      }
      return res.json({ ok: true, ...service.activateNextCohort() });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/recruitment/reviewer/cohorts/:cohortId/activate", requireReviewer, (req, res, next) => {
    try {
      noStore(res);
      if (req.body?.confirm !== true) {
        return res.status(400).json({
          ok: false,
          code: "cohort_activation_confirmation_required",
          message: "Confirm activation of the prepared application window.",
        });
      }
      return res.json({ ok: true, ...service.activateNextCohort(req.params.cohortId) });
    } catch (error) {
      return next(error);
    }
  });

  app.use("/api/recruitment", (_req, res) => {
    noStore(res);
    return res.status(404).json({ ok: false, code: "recruitment_route_missing", message: "Not found." });
  });

  if (staticDirectory) {
    const absoluteStaticDirectory = path.resolve(staticDirectory);
    app.use(express.static(absoluteStaticDirectory, { index: "index.html", fallthrough: true }));
    const indexPath = path.join(absoluteStaticDirectory, "index.html");
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      return res.sendFile(indexPath);
    });
  }

  app.use(recruitmentErrorHandler);
  return app;
}

async function resolveHttpDependencies(options) {
  const expressModule = options.expressModule || await import("express");
  const multerModule = options.multerModule || await import("multer");
  return {
    express: expressModule.default || expressModule,
    multer: multerModule.default || multerModule,
  };
}

export async function createRecruitmentApp(options = {}) {
  const { express, multer } = await resolveHttpDependencies(options);
  const app = options.app || express();
  return mountRecruitmentRoutes(app, { ...options, express, multer });
}

export async function createRecruitmentRuntime(options = {}) {
  const env = options.env || process.env;
  const dataRoot = options.dataRoot || resolveRecruitmentDataRoot(env);
  const storage = options.storage || createRecruitmentStorage({
    dataRoot,
    env,
    projectRoot: options.projectRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    maxAudioBytes: options.maxAudioBytes || Number(env.RECRUITMENT_MAX_AUDIO_BYTES) || DEFAULT_MAX_AUDIO_BYTES,
  });
  storage.initialize();
  const database = options.database || createRecruitmentDatabase({ databasePath: storage.databasePath });
  try {
    if (
      typeof storage.recoverInterruptedOperations === "function"
      && typeof database.listCohortMonthKeys === "function"
      && typeof database.listAudioStorageKeys === "function"
    ) {
      storage.recoverInterruptedOperations(
        database.listCohortMonthKeys(),
        database.listAudioStorageKeys(),
      );
    }
    const emailSender = options.emailSender || createRecruitmentEmailSender({
      apiKey: env.RESEND_API_KEY,
      from: env.RECRUITMENT_EMAIL_FROM,
      replyTo: env.RECRUITMENT_EMAIL_REPLY_TO,
      bookingUrl: env.RECRUITMENT_BOOKING_URL,
      client: options.resendClient,
    });
    const service = options.service || createRecruitmentService({
      database,
      storage,
      emailSender,
      now: options.now,
    });
    const cookieCodec = options.cookieCodec || createSignedCookieCodec(env.RECRUITMENT_COOKIE_SECRET);
    const reviewerSecret = validateReviewerSecret(options.reviewerSecret || env.RECRUITMENT_REVIEWER_SECRET);
    const app = await createRecruitmentApp({
      ...options,
      service,
      cookieCodec,
      reviewerSecret,
      reviewerSessionMinutes: options.reviewerSessionMinutes || env.RECRUITMENT_REVIEWER_SESSION_MINUTES,
      secureCookies: options.secureCookies ?? env.NODE_ENV === "production",
      maxAudioBytes: storage.maxAudioBytes,
      staticDirectory: options.staticDirectory || "",
    });
    let closed = false;
    return Object.freeze({
      app,
      service,
      database,
      storage,
      close() {
        if (closed) return;
        closed = true;
        database.close();
      },
    });
  } catch (error) {
    if (!options.database) database.close();
    throw error;
  }
}
