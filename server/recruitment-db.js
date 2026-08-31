import { randomUUID } from "node:crypto";
import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const RECRUITMENT_SCHEMA_VERSION = 1;

export class RecruitmentDatabaseError extends Error {
  constructor(message, code = "database_error", statusCode = 500) {
    super(message);
    this.name = "RecruitmentDatabaseError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cohortFromRow(row) {
  if (!row) return null;
  return {
    cohortId: row.cohort_id,
    monthKey: row.month_key,
    displayName: row.display_name,
    slot: row.slot || "",
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    passwordParameters: row.password_parameters,
    createdAt: row.created_at,
    activatedAt: row.activated_at || "",
    applicationCount: Number(row.application_count || 0),
    pendingCount: Number(row.pending_count || 0),
    processedCount: Number(row.processed_count || 0),
  };
}

function applicationFromRow(row) {
  if (!row) return null;
  return {
    applicationId: row.application_id,
    cohortId: row.cohort_id,
    cohortMonth: row.cohort_month || "",
    fullName: row.full_name,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    audioStorageKey: row.audio_storage_key,
    audioMimeType: row.audio_mime_type,
    audioFileSize: Number(row.audio_file_size || 0),
    audioDurationSeconds: Number(row.audio_duration_seconds || 0),
    submittedAt: row.submitted_at,
    decision: row.decision || "pending",
    reviewedAt: row.reviewed_at || "",
    emailStatus: row.email_status,
    emailAttemptedAt: row.email_attempted_at || "",
    emailAttemptCount: Number(row.email_attempt_count || 0),
    emailProviderId: row.email_provider_id || "",
    emailError: row.email_error || "",
  };
}

function transaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch (_rollbackError) {
      // The original error is the useful failure.
    }
    throw error;
  }
}

function incrementMonthKey(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ""));
  if (!match) {
    throw new RecruitmentDatabaseError("Internal window storage key is invalid.", "invalid_month_key");
  }
  const monthIndex = Number(match[1]) * 12 + Number(match[2]);
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = monthIndex % 12 + 1;
  if (nextYear > 9999) {
    throw new RecruitmentDatabaseError("Internal window storage keys are exhausted.", "month_key_exhausted");
  }
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function createRecruitmentDatabase(options = {}) {
  const databasePath = String(options.databasePath || "").trim();
  if (!databasePath) {
    throw new RecruitmentDatabaseError("Recruitment database path is required.", "missing_database_path");
  }
  const database = options.database || new DatabaseSync(databasePath);
  if (!options.database && databasePath !== ":memory:" && existsSync(databasePath)) {
    chmodSync(databasePath, 0o600);
  }
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_cohorts (
      cohort_id TEXT PRIMARY KEY NOT NULL,
      month_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      slot TEXT CHECK (slot IN ('previous', 'current', 'next') OR slot IS NULL),
      opens_at TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      password_parameters TEXT NOT NULL,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      CHECK (opens_at < closes_at)
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS recruitment_cohorts_slot_unique
      ON recruitment_cohorts(slot)
      WHERE slot IS NOT NULL;

    CREATE TABLE IF NOT EXISTS recruitment_applications (
      application_id TEXT PRIMARY KEY NOT NULL,
      cohort_id TEXT NOT NULL REFERENCES recruitment_cohorts(cohort_id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      linkedin_url TEXT NOT NULL,
      audio_storage_key TEXT NOT NULL UNIQUE,
      audio_mime_type TEXT NOT NULL,
      audio_file_size INTEGER NOT NULL CHECK (audio_file_size > 0),
      audio_duration_seconds REAL NOT NULL CHECK (audio_duration_seconds >= 0 AND audio_duration_seconds <= 60),
      submitted_at TEXT NOT NULL,
      decision TEXT CHECK (decision IN ('pass', 'fail') OR decision IS NULL),
      reviewed_at TEXT,
      email_status TEXT NOT NULL DEFAULT 'not_attempted'
        CHECK (email_status IN ('not_attempted', 'attempting', 'sent', 'failed')),
      email_attempted_at TEXT,
      email_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (email_attempt_count IN (0, 1)),
      email_provider_id TEXT,
      email_error TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS recruitment_applications_pending_oldest
      ON recruitment_applications(submitted_at, application_id)
      WHERE decision IS NULL;

    PRAGMA user_version = ${RECRUITMENT_SCHEMA_VERSION};
  `);
  for (const privatePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!options.database && privatePath !== ":memory:" && existsSync(privatePath)) {
      chmodSync(privatePath, 0o600);
    }
  }

  const cohortSelect = `
    SELECT c.*,
      (SELECT COUNT(*) FROM recruitment_applications a WHERE a.cohort_id = c.cohort_id) AS application_count,
      (SELECT COUNT(*) FROM recruitment_applications a WHERE a.cohort_id = c.cohort_id AND a.decision IS NULL) AS pending_count,
      (SELECT COUNT(*) FROM recruitment_applications a WHERE a.cohort_id = c.cohort_id AND a.decision IS NOT NULL) AS processed_count
    FROM recruitment_cohorts c
  `;
  const applicationSelect = `
    SELECT a.*, c.month_key AS cohort_month
    FROM recruitment_applications a
    JOIN recruitment_cohorts c ON c.cohort_id = a.cohort_id
  `;

  function getCohortById(cohortId) {
    return cohortFromRow(database.prepare(`${cohortSelect} WHERE c.cohort_id = ?`).get(cohortId));
  }

  function getCohortBySlot(slot) {
    return cohortFromRow(database.prepare(`${cohortSelect} WHERE c.slot = ?`).get(slot));
  }

  function listCohorts() {
    return database.prepare(`${cohortSelect}
      ORDER BY CASE c.slot WHEN 'current' THEN 0 WHEN 'previous' THEN 1 WHEN 'next' THEN 2 ELSE 3 END,
        c.month_key DESC
    `).all().map(cohortFromRow);
  }

  function listCohortMonthKeys() {
    return database.prepare("SELECT month_key FROM recruitment_cohorts ORDER BY month_key")
      .all()
      .map((row) => String(row.month_key));
  }

  function listAudioStorageKeys() {
    return database.prepare("SELECT audio_storage_key FROM recruitment_applications ORDER BY audio_storage_key")
      .all()
      .map((row) => String(row.audio_storage_key));
  }

  function allocateMonthKey(preferredMonthKey) {
    const latest = database.prepare(
      "SELECT month_key FROM recruitment_cohorts ORDER BY month_key DESC LIMIT 1",
    ).get();
    return !latest || String(preferredMonthKey) > String(latest.month_key)
      ? String(preferredMonthKey)
      : incrementMonthKey(latest.month_key);
  }

  function createNextCohort(input) {
    return transaction(database, () => {
      if (getCohortBySlot("next")) {
        throw new RecruitmentDatabaseError(
          "A prepared application window already exists.",
          "next_cohort_exists",
          409,
        );
      }
      const allocatedMonthKey = allocateMonthKey(input.monthKey);
      const cohortId = randomUUID();
      database.prepare(`
        INSERT INTO recruitment_cohorts (
          cohort_id, month_key, display_name, slot, opens_at, closes_at,
          password_salt, password_hash, password_parameters, created_at
        ) VALUES (?, ?, ?, 'next', ?, ?, ?, ?, ?, ?)
      `).run(
        cohortId,
        allocatedMonthKey,
        input.displayName,
        input.opensAt,
        input.closesAt,
        input.passwordSalt,
        input.passwordHash,
        input.passwordParameters,
        input.createdAt,
      );
      return getCohortById(cohortId);
    });
  }

  function cohortStateSnapshot() {
    return database.prepare(`
      SELECT cohort_id, COALESCE(slot, '') AS slot
      FROM recruitment_cohorts
      ORDER BY cohort_id
    `).all().map((row) => `${row.cohort_id}:${row.slot}`);
  }

  function previewCreateAndActivate(preferredMonthKey) {
    const current = getCohortBySlot("current");
    const previous = getCohortBySlot("previous");
    if (current && Number(current.pendingCount) > 0) {
      throw new RecruitmentDatabaseError(
        "Review every waiting application before creating a new application window.",
        "current_cohort_has_pending_applications",
        409,
      );
    }

    const retainedPrevious = current || previous;
    const allocatedMonthKey = allocateMonthKey(preferredMonthKey);

    const purgeRows = retainedPrevious
      ? database.prepare(`
          SELECT c.cohort_id, c.month_key, a.audio_storage_key
          FROM recruitment_cohorts c
          LEFT JOIN recruitment_applications a ON a.cohort_id = c.cohort_id
          WHERE c.cohort_id <> ?
          ORDER BY c.month_key, a.application_id
        `).all(retainedPrevious.cohortId)
      : database.prepare(`
          SELECT c.cohort_id, c.month_key, a.audio_storage_key
          FROM recruitment_cohorts c
          LEFT JOIN recruitment_applications a ON a.cohort_id = c.cohort_id
          ORDER BY c.month_key, a.application_id
        `).all();

    return Object.freeze({
      expectedState: cohortStateSnapshot(),
      expectedCurrentId: current?.cohortId || "",
      retainedPreviousId: retainedPrevious?.cohortId || "",
      preferredMonthKey: String(preferredMonthKey),
      allocatedMonthKey,
      purgeCohortIds: [...new Set(purgeRows.map((row) => row.cohort_id))],
      purgeCohortMonths: [...new Set(purgeRows.map((row) => row.month_key))],
      purgeAudioStorageKeys: purgeRows.map((row) => row.audio_storage_key).filter(Boolean),
    });
  }

  function createAndActivateCohort(preview, input) {
    return transaction(database, () => {
      if (JSON.stringify(cohortStateSnapshot()) !== JSON.stringify(preview.expectedState)) {
        throw new RecruitmentDatabaseError(
          "The application-window state changed. Reload and try again.",
          "cohort_activation_conflict",
          409,
        );
      }

      const current = getCohortBySlot("current");
      const previous = getCohortBySlot("previous");
      const retainedPrevious = current || previous;
      if (
        String(current?.cohortId || "") !== String(preview.expectedCurrentId || "")
        || String(retainedPrevious?.cohortId || "") !== String(preview.retainedPreviousId || "")
      ) {
        throw new RecruitmentDatabaseError(
          "The application-window state changed. Reload and try again.",
          "cohort_activation_conflict",
          409,
        );
      }
      if (current && Number(current.pendingCount) > 0) {
        throw new RecruitmentDatabaseError(
          "Review every waiting application before creating a new application window.",
          "current_cohort_has_pending_applications",
          409,
        );
      }

      if (
        String(input.monthKey) !== String(preview.allocatedMonthKey)
        || allocateMonthKey(preview.preferredMonthKey) !== String(preview.allocatedMonthKey)
      ) {
        throw new RecruitmentDatabaseError(
          "The application-window state changed. Reload and try again.",
          "cohort_activation_conflict",
          409,
        );
      }

      database.prepare("UPDATE recruitment_cohorts SET slot = NULL WHERE slot IS NOT NULL").run();
      if (retainedPrevious) {
        database.prepare("DELETE FROM recruitment_cohorts WHERE cohort_id <> ?")
          .run(retainedPrevious.cohortId);
        database.prepare("UPDATE recruitment_cohorts SET slot = 'previous' WHERE cohort_id = ?")
          .run(retainedPrevious.cohortId);
      } else {
        database.prepare("DELETE FROM recruitment_cohorts").run();
      }

      const cohortId = randomUUID();
      database.prepare(`
        INSERT INTO recruitment_cohorts (
          cohort_id, month_key, display_name, slot, opens_at, closes_at,
          password_salt, password_hash, password_parameters, created_at, activated_at
        ) VALUES (?, ?, ?, 'current', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cohortId,
        input.monthKey,
        input.displayName,
        input.opensAt,
        input.closesAt,
        input.passwordSalt,
        input.passwordHash,
        input.passwordParameters,
        input.createdAt,
        input.activatedAt,
      );

      return {
        current: getCohortById(cohortId),
        previous: retainedPrevious ? getCohortById(retainedPrevious.cohortId) : null,
        purgedCohortIds: preview.purgeCohortIds,
      };
    });
  }

  function previewDeleteCurrentCohort(expectedCohortId) {
    const current = getCohortBySlot("current");
    if (!current) {
      throw new RecruitmentDatabaseError(
        "There is no active application window to remove.",
        "current_cohort_missing",
        404,
      );
    }
    if (current.cohortId !== String(expectedCohortId || "")) {
      throw new RecruitmentDatabaseError(
        "The active application window changed. Reload and try again.",
        "cohort_delete_target_mismatch",
        409,
      );
    }
    const audioStorageKeys = database.prepare(`
      SELECT audio_storage_key
      FROM recruitment_applications
      WHERE cohort_id = ?
      ORDER BY audio_storage_key
    `).all(current.cohortId).map((row) => String(row.audio_storage_key));
    return Object.freeze({
      expectedCurrentId: current.cohortId,
      monthKey: current.monthKey,
      audioStorageKeys,
    });
  }

  function deleteCurrentCohort(preview) {
    return transaction(database, () => {
      const current = getCohortBySlot("current");
      if (!current || current.cohortId !== preview.expectedCurrentId) {
        throw new RecruitmentDatabaseError(
          "The active application window changed. Reload and try again.",
          "cohort_delete_conflict",
          409,
        );
      }
      const deleted = database.prepare(`
        DELETE FROM recruitment_cohorts
        WHERE cohort_id = ? AND slot = 'current'
      `).run(current.cohortId);
      if (Number(deleted.changes) !== 1) {
        throw new RecruitmentDatabaseError(
          "The active application window changed. Reload and try again.",
          "cohort_delete_conflict",
          409,
        );
      }
      return {
        deletedCohortId: current.cohortId,
        deletedMonthKey: current.monthKey,
      };
    });
  }

  function previewActivateNext() {
    const next = getCohortBySlot("next");
    if (!next) {
      throw new RecruitmentDatabaseError(
        "There is no prepared application window to activate.",
        "next_cohort_missing",
        409,
      );
    }
    const current = getCohortBySlot("current");
    const previous = getCohortBySlot("previous");
    const retainedPrevious = current || previous;
    const keepIds = [next.cohortId, retainedPrevious?.cohortId].filter(Boolean);
    const placeholders = keepIds.map(() => "?").join(", ");
    const purgeRows = keepIds.length
      ? database.prepare(`
          SELECT c.cohort_id, c.month_key, a.audio_storage_key
          FROM recruitment_cohorts c
          LEFT JOIN recruitment_applications a ON a.cohort_id = c.cohort_id
          WHERE c.cohort_id NOT IN (${placeholders})
          ORDER BY c.month_key, a.application_id
        `).all(...keepIds)
      : [];
    return Object.freeze({
      expectedNextId: next.cohortId,
      expectedCurrentId: current?.cohortId || "",
      retainedPreviousId: retainedPrevious?.cohortId || "",
      purgeCohortIds: [...new Set(purgeRows.map((row) => row.cohort_id))],
      purgeCohortMonths: [...new Set(purgeRows.map((row) => row.month_key))],
      purgeAudioStorageKeys: purgeRows.map((row) => row.audio_storage_key).filter(Boolean),
    });
  }

  function activateNext(preview, activatedAt) {
    return transaction(database, () => {
      const next = getCohortBySlot("next");
      const current = getCohortBySlot("current");
      const previous = getCohortBySlot("previous");
      const retainedPrevious = current || previous;
      if (
        !next
        || next.cohortId !== preview.expectedNextId
        || String(current?.cohortId || "") !== String(preview.expectedCurrentId || "")
        || String(retainedPrevious?.cohortId || "") !== String(preview.retainedPreviousId || "")
      ) {
        throw new RecruitmentDatabaseError(
          "The application-window state changed. Reload and try again.",
          "cohort_activation_conflict",
          409,
        );
      }
      const keepIds = [next.cohortId, retainedPrevious?.cohortId].filter(Boolean);
      database.prepare("UPDATE recruitment_cohorts SET slot = NULL WHERE slot IS NOT NULL").run();
      if (keepIds.length) {
        const placeholders = keepIds.map(() => "?").join(", ");
        database.prepare(`DELETE FROM recruitment_cohorts WHERE cohort_id NOT IN (${placeholders})`).run(...keepIds);
      }
      if (retainedPrevious) {
        database.prepare("UPDATE recruitment_cohorts SET slot = 'previous' WHERE cohort_id = ?")
          .run(retainedPrevious.cohortId);
      }
      database.prepare(`
        UPDATE recruitment_cohorts
        SET slot = 'current', activated_at = ?
        WHERE cohort_id = ?
      `).run(activatedAt, next.cohortId);
      return {
        current: getCohortById(next.cohortId),
        previous: retainedPrevious ? getCohortById(retainedPrevious.cohortId) : null,
        purgedCohortIds: preview.purgeCohortIds,
      };
    });
  }

  function createApplication(input) {
    const applicationId = randomUUID();
    database.prepare(`
      INSERT INTO recruitment_applications (
        application_id, cohort_id, full_name, email, linkedin_url,
        audio_storage_key, audio_mime_type, audio_file_size,
        audio_duration_seconds, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      applicationId,
      input.cohortId,
      input.fullName,
      input.email,
      input.linkedinUrl,
      input.audioStorageKey,
      input.audioMimeType,
      input.audioFileSize,
      input.audioDurationSeconds,
      input.submittedAt,
    );
    return getApplication(applicationId);
  }

  function getApplication(applicationId) {
    return applicationFromRow(database.prepare(`${applicationSelect} WHERE a.application_id = ?`)
      .get(applicationId));
  }

  function listPendingApplications(limit = 500) {
    const query = `${applicationSelect}
      WHERE a.decision IS NULL AND c.slot = 'current'
      ORDER BY a.submitted_at ASC, a.application_id ASC`;
    const requestedLimit = Number(limit);
    const rows = database.prepare(`${query} LIMIT ?`).all(
      Math.max(1, Math.min(5_000, Math.floor(requestedLimit) || 500)),
    );
    return rows.map(applicationFromRow);
  }

  function listProcessedApplications(limit = 500) {
    const requestedLimit = Number(limit);
    const perCohortLimit = Math.max(
      1,
      Math.min(2_500, Math.floor(requestedLimit) || 500),
    );
    const query = `${applicationSelect}
      WHERE a.decision IS NOT NULL AND c.slot = ?
      ORDER BY a.reviewed_at DESC, a.application_id DESC`;
    const statement = database.prepare(`${query} LIMIT ?`);
    const rows = [
      ...statement.all("current", perCohortLimit),
      ...statement.all("previous", perCohortLimit),
    ].sort((left, right) => {
      const reviewedOrder = String(right.reviewed_at || "")
        .localeCompare(String(left.reviewed_at || ""));
      return reviewedOrder || String(right.application_id).localeCompare(String(left.application_id));
    });
    return rows.map(applicationFromRow);
  }

  function decideApplication(applicationId, decision, reviewedAt) {
    return transaction(database, () => {
      const existing = getApplication(applicationId);
      if (!existing) {
        throw new RecruitmentDatabaseError("Application not found.", "application_missing", 404);
      }
      if (existing.decision !== "pending") {
        throw new RecruitmentDatabaseError(
          "This application already has an irreversible decision.",
          "application_already_decided",
          409,
        );
      }
      const result = database.prepare(`
        UPDATE recruitment_applications
        SET decision = ?, reviewed_at = ?, email_status = 'attempting',
          email_attempted_at = ?, email_attempt_count = 1
        WHERE application_id = ? AND decision IS NULL AND email_attempt_count = 0
      `).run(decision, reviewedAt, reviewedAt, applicationId);
      if (Number(result.changes) !== 1) {
        throw new RecruitmentDatabaseError(
          "This application was decided by another request.",
          "application_decision_conflict",
          409,
        );
      }
      return getApplication(applicationId);
    });
  }

  function recordEmailResult(applicationId, result) {
    const status = result.ok ? "sent" : "failed";
    const update = database.prepare(`
      UPDATE recruitment_applications
      SET email_status = ?, email_provider_id = ?, email_error = ?
      WHERE application_id = ? AND email_status = 'attempting' AND email_attempt_count = 1
    `).run(
      status,
      result.providerId || null,
      result.ok ? null : String(result.error || "Outcome email failed.").slice(0, 1000),
      applicationId,
    );
    if (Number(update.changes) !== 1) {
      throw new RecruitmentDatabaseError(
        "Outcome email state could not be recorded.",
        "email_result_conflict",
        409,
      );
    }
    return getApplication(applicationId);
  }

  function healthCheck() {
    try {
      const result = database.prepare("PRAGMA quick_check").get();
      const value = result?.quick_check || Object.values(result || {})[0];
      return {
        ok: value === "ok",
        schemaVersion: Number(database.prepare("PRAGMA user_version").get()?.user_version || 0),
      };
    } catch (_error) {
      return { ok: false, schemaVersion: 0 };
    }
  }

  function close() {
    database.close();
  }

  return Object.freeze({
    databasePath,
    getCohortById,
    getCohortBySlot,
    listCohorts,
    listCohortMonthKeys,
    listAudioStorageKeys,
    createNextCohort,
    previewCreateAndActivate,
    createAndActivateCohort,
    previewDeleteCurrentCohort,
    deleteCurrentCohort,
    previewActivateNext,
    activateNext,
    createApplication,
    getApplication,
    listPendingApplications,
    listProcessedApplications,
    decideApplication,
    recordEmailResult,
    healthCheck,
    close,
  });
}
