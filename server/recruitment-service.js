import { hashCohortPassword, verifyCohortPassword, assertMonthKey, cohortWindowState, normalizeMadridTimestamp } from "./recruitment-access.js";

export class RecruitmentServiceError extends Error {
  constructor(message, code = "recruitment_error", statusCode = 400) {
    super(message);
    this.name = "RecruitmentServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function requiredText(value, label, maximumLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new RecruitmentServiceError(`${label} is required.`, "required_field");
  if (normalized.length > maximumLength) {
    throw new RecruitmentServiceError(`${label} is too long.`, "field_too_long");
  }
  return normalized;
}

function normalizeEmail(value) {
  const email = requiredText(value, "Email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RecruitmentServiceError("Enter a valid email address.", "invalid_email");
  }
  return email;
}

function normalizeLinkedInUrl(value) {
  const raw = requiredText(value, "LinkedIn profile", 500);
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new RecruitmentServiceError("Enter a valid LinkedIn profile URL.", "invalid_linkedin");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:"
    || (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))
    || url.pathname === "/"
  ) {
    throw new RecruitmentServiceError("Enter a valid LinkedIn profile URL.", "invalid_linkedin");
  }
  url.hash = "";
  return url.toString();
}

function normalizeDurationSeconds(value) {
  const raw = String(value ?? "").trim();
  const duration = Number(raw);
  if (!raw || !Number.isFinite(duration) || duration < 0) {
    throw new RecruitmentServiceError("Voice-note duration is invalid.", "invalid_audio_duration");
  }
  if (duration > 60) {
    throw new RecruitmentServiceError(
      "The voice note must be no longer than 60 seconds.",
      "audio_too_long",
    );
  }
  return Math.round(duration * 1000) / 1000;
}

function publicCohort(cohort, now) {
  if (!cohort) return null;
  return Object.freeze({
    id: cohort.cohortId,
    cohortId: cohort.cohortId,
    slug: cohort.monthKey,
    monthKey: cohort.monthKey,
    displayName: cohort.displayName,
    slot: cohort.slot,
    active: cohort.slot === "current",
    opensAt: cohort.opensAt,
    closesAt: cohort.closesAt,
    state: cohortWindowState(cohort, now),
    applicationCount: cohort.applicationCount,
    pendingCount: cohort.pendingCount,
    processedCount: cohort.processedCount,
  });
}

function reviewerApplication(application) {
  if (!application) return null;
  return Object.freeze({
    id: application.applicationId,
    applicationId: application.applicationId,
    cohortId: application.cohortId,
    cohortMonth: application.cohortMonth,
    fullName: application.fullName,
    email: application.email,
    linkedinUrl: application.linkedinUrl,
    linkedin: application.linkedinUrl,
    audioMimeType: application.audioMimeType,
    audioFileSize: application.audioFileSize,
    audioDurationSeconds: application.audioDurationSeconds,
    audioDurationMs: Math.round(application.audioDurationSeconds * 1000),
    submittedAt: application.submittedAt,
    receivedAt: application.submittedAt,
    decision: application.decision,
    reviewedAt: application.reviewedAt,
    emailStatus: application.emailStatus,
    emailAttemptedAt: application.emailAttemptedAt,
    emailAttemptCount: application.emailAttemptCount,
    emailProviderId: application.emailProviderId,
    emailError: application.emailError,
  });
}

const madridMonthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
});

function madridMonthKey(isoTimestamp) {
  const parts = Object.fromEntries(madridMonthFormatter.formatToParts(new Date(isoTimestamp))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

export function createRecruitmentService(options = {}) {
  const database = options.database;
  const storage = options.storage;
  const emailSender = options.emailSender;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  if (!database || !storage || !emailSender) {
    throw new RecruitmentServiceError(
      "Recruitment database, storage, and email sender are required.",
      "missing_service_dependency",
      500,
    );
  }

  function currentTime() {
    const value = now();
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new RecruitmentServiceError("Recruitment clock is invalid.", "invalid_clock", 500);
    }
    return date;
  }

  function getApplicantStatus(sessionPayload = null) {
    const instant = currentTime();
    const session = validateApplicantSession(sessionPayload, { throwOnFailure: false, now: instant });
    if (session) {
      return {
        unlocked: true,
        state: "open",
        cohort: publicCohort(session.cohort, instant),
      };
    }
    const cohort = database.getCohortBySlot("current");
    return {
      unlocked: false,
      state: cohortWindowState(cohort, instant),
      cohort: publicCohort(cohort, instant),
    };
  }

  async function unlockApplicant(password) {
    const instant = currentTime();
    const cohort = database.getCohortBySlot("current");
    if (!cohort || cohortWindowState(cohort, instant) !== "open") {
      throw new RecruitmentServiceError(
        "This application cohort is not currently open.",
        "cohort_not_open",
        403,
      );
    }
    if (!await verifyCohortPassword(password, cohort)) {
      throw new RecruitmentServiceError("That application code is not valid.", "invalid_cohort_password", 401);
    }
    const expiresAt = new Date(cohort.closesAt);
    return {
      cohort: publicCohort(cohort, instant),
      expiresAt,
      sessionPayload: Object.freeze({
        v: 1,
        kind: "applicant",
        cohortId: cohort.cohortId,
        exp: Math.floor(expiresAt.getTime() / 1000),
      }),
    };
  }

  function validateApplicantSession(payload, validationOptions = {}) {
    const instant = validationOptions.now || currentTime();
    const fail = (message, code) => {
      if (validationOptions.throwOnFailure === false) return null;
      throw new RecruitmentServiceError(message, code, 401);
    };
    if (
      !payload
      || payload.v !== 1
      || payload.kind !== "applicant"
      || typeof payload.cohortId !== "string"
      || !Number.isFinite(Number(payload.exp))
      || instant.getTime() >= Number(payload.exp) * 1000
    ) {
      return fail("Application access has expired.", "applicant_session_expired");
    }
    const cohort = database.getCohortById(payload.cohortId);
    if (
      !cohort
      || cohort.slot !== "current"
      || cohortWindowState(cohort, instant) !== "open"
    ) {
      return fail("Application access has expired.", "applicant_session_expired");
    }
    return { cohort, payload };
  }

  function submitApplication(input) {
    const instant = currentTime();
    const session = validateApplicantSession(input.sessionPayload, { now: instant });
    const fullName = requiredText(input.fullName, "Full name", 160);
    const email = normalizeEmail(input.email);
    const linkedinUrl = normalizeLinkedInUrl(input.linkedinUrl);
    const audioDurationSeconds = normalizeDurationSeconds(input.audioDurationSeconds);
    const storedAudio = storage.storeAudio(
      session.cohort.monthKey,
      input.audioBuffer,
      input.audioMimeType,
    );
    try {
      const application = database.createApplication({
        cohortId: session.cohort.cohortId,
        fullName,
        email,
        linkedinUrl,
        audioStorageKey: storedAudio.storageKey,
        audioMimeType: storedAudio.mimeType,
        audioFileSize: storedAudio.fileSize,
        audioDurationSeconds,
        submittedAt: instant.toISOString(),
      });
      return {
        ok: true,
        application: Object.freeze({
          applicationId: application.applicationId,
          submittedAt: application.submittedAt,
          cohortMonth: application.cohortMonth,
        }),
      };
    } catch (error) {
      try {
        storage.removeAudio(storedAudio.storageKey);
      } catch (_cleanupError) {
        // Preserve the originating database failure for the caller.
      }
      throw error;
    }
  }

  function listPendingApplications(limit) {
    return database.listPendingApplications(limit).map(reviewerApplication);
  }

  function listProcessedApplications(limit) {
    return database.listProcessedApplications(limit).map(reviewerApplication);
  }

  function getReviewerAudio(applicationId) {
    const application = database.getApplication(applicationId);
    if (!application) {
      throw new RecruitmentServiceError("Application not found.", "application_missing", 404);
    }
    const file = storage.statAudio(application.audioStorageKey);
    return {
      application: reviewerApplication(application),
      storageKey: application.audioStorageKey,
      mimeType: application.audioMimeType,
      filePath: file.filePath,
      fileSize: file.stats.size,
    };
  }

  async function decideApplication(applicationId, decision) {
    if (!new Set(["pass", "fail"]).has(decision)) {
      throw new RecruitmentServiceError("Decision must be pass or fail.", "invalid_decision");
    }
    if (emailSender.configured !== true) {
      throw new RecruitmentServiceError(
        "Outcome email is not configured. No decision was recorded.",
        "outcome_email_not_configured",
        503,
      );
    }
    const decided = database.decideApplication(
      String(applicationId || ""),
      decision,
      currentTime().toISOString(),
    );

    // The database transition above irreversibly reserves the one allowed attempt.
    // This provider call is intentionally never retried, including after failure.
    let delivery;
    try {
      delivery = await emailSender.sendOutcome(decided);
    } catch (error) {
      delivery = {
        ok: false,
        error: String(error?.message || error || "Outcome email failed.").slice(0, 1000),
      };
    }
    const recorded = database.recordEmailResult(decided.applicationId, delivery);
    return {
      application: reviewerApplication(recorded),
      email: {
        status: recorded.emailStatus,
        providerId: recorded.emailProviderId,
        error: recorded.emailError,
      },
    };
  }

  async function createNextCohort(input) {
    const monthKey = assertMonthKey(input.monthKey ?? input.slug);
    const displayName = requiredText(input.displayName ?? monthKey, "Cohort display name", 120);
    const opensAt = normalizeMadridTimestamp(input.opensAt);
    const closesAt = normalizeMadridTimestamp(input.closesAt);
    if (Date.parse(opensAt) >= Date.parse(closesAt)) {
      throw new RecruitmentServiceError("Cohort closing time must follow its opening time.", "invalid_window");
    }
    if (madridMonthKey(opensAt) !== monthKey) {
      throw new RecruitmentServiceError(
        "Cohort opening time must fall within its Europe/Madrid month.",
        "cohort_month_mismatch",
      );
    }
    const password = await hashCohortPassword(input.password);
    const cohort = database.createNextCohort({
      monthKey,
      displayName,
      opensAt,
      closesAt,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      passwordParameters: password.parameters,
      createdAt: currentTime().toISOString(),
    });
    return publicCohort(cohort, currentTime());
  }

  function activateNextCohort(expectedCohortId = "") {
    const preview = database.previewActivateNext();
    if (expectedCohortId && preview.expectedNextId !== String(expectedCohortId)) {
      throw new RecruitmentServiceError(
        "Only the prepared next cohort can be activated.",
        "cohort_activation_target_mismatch",
        409,
      );
    }
    const current = database.getCohortBySlot("current");
    if (current && Number(current.pendingCount) > 0) {
      throw new RecruitmentServiceError(
        "Review every waiting application before activating the next cohort.",
        "current_cohort_has_pending_applications",
        409,
      );
    }
    const quarantine = storage.quarantineCohorts(preview.purgeCohortMonths);
    let result;
    try {
      result = database.activateNext(preview, currentTime().toISOString());
    } catch (error) {
      storage.rollbackQuarantine(quarantine);
      throw error;
    }
    storage.commitQuarantine(quarantine);
    return {
      current: publicCohort(result.current, currentTime()),
      previous: publicCohort(result.previous, currentTime()),
      purgedCohortIds: result.purgedCohortIds,
      purgedAudioCount: preview.purgeAudioStorageKeys.length,
    };
  }

  function listCohortControls() {
    const instant = currentTime();
    const cohorts = database.listCohorts();
    return {
      current: publicCohort(cohorts.find((cohort) => cohort.slot === "current"), instant),
      previous: publicCohort(cohorts.find((cohort) => cohort.slot === "previous"), instant),
      next: publicCohort(cohorts.find((cohort) => cohort.slot === "next"), instant),
    };
  }

  function healthCheck() {
    const databaseHealth = database.healthCheck();
    const storageHealth = storage.healthCheck();
    return {
      ok: databaseHealth.ok && storageHealth.ok && emailSender.configured === true,
      database: databaseHealth,
      storage: storageHealth,
      emailConfigured: emailSender.configured === true,
    };
  }

  return Object.freeze({
    getApplicantStatus,
    unlockApplicant,
    validateApplicantSession,
    submitApplication,
    listPendingApplications,
    listProcessedApplications,
    getReviewerAudio,
    decideApplication,
    createNextCohort,
    activateNextCohort,
    listCohortControls,
    healthCheck,
  });
}
