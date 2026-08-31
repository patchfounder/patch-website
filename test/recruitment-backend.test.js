import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSignedCookieCodec } from "../server/recruitment-access.js";
import { createRecruitmentApp } from "../server/app.js";
import { createRecruitmentDatabase } from "../server/recruitment-db.js";
import { createRecruitmentService } from "../server/recruitment-service.js";
import { createRecruitmentStorage, resolveRecruitmentDataRoot } from "../server/recruitment-storage.js";

function temporaryDataRoot(label) {
  return mkdtempSync(path.join(tmpdir(), `patch-website-${label}-`));
}

test("service preserves only current/previous cohorts and attempts each outcome email once", async () => {
  const dataRoot = temporaryDataRoot("recruitment-core");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  assert.equal(statSync(storage.databasePath).mode & 0o777, 0o600);
  assert.equal(statSync(storage.audioDirectory).mode & 0o777, 0o700);
  let now = new Date("2026-08-31T12:00:00.000Z");
  const deliveries = [];
  const emailSender = {
    configured: true,
    async sendOutcome(application) {
      deliveries.push({ id: application.applicationId, decision: application.decision });
      if (application.decision === "fail") throw new Error("provider rejected message");
      return { ok: true, providerId: "resend-one" };
    },
  };
  const service = createRecruitmentService({ database, storage, emailSender, now: () => now });

  try {
    await assert.rejects(
      service.unlockApplicant("unused-password"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "no cohort means no applicant can log in",
    );
    const supersededSeptemberDraft = await service.createNextCohort({
      slug: "2099-12",
      displayName: "This client label must be ignored",
      password: "superseded-september-password",
      opensAt: "2026-08-01T00:00",
      closesAt: "2026-08-30T23:59",
    });
    const septemberActivated = await service.createAndActivateCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    const septemberCohort = septemberActivated.current;
    assert.equal(septemberCohort.slug, "2026-09");
    assert.equal(septemberCohort.displayName, "September 2026");
    assert.equal(database.getCohortBySlot("next"), null);
    assert.equal(database.getCohortById(supersededSeptemberDraft.cohortId), null);
    await assert.rejects(
      service.unlockApplicant("shared-september-password"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "a cohort password cannot be used before its opening time",
    );

    now = new Date("2026-09-15T10:00:00.000Z");
    await assert.rejects(
      service.unlockApplicant("wrong-password"),
      (error) => error.code === "invalid_cohort_password",
    );
    await assert.rejects(
      service.unlockApplicant("superseded-september-password"),
      (error) => error.code === "invalid_cohort_password",
      "one-step activation replaces a legacy next cohort and its password",
    );
    const unlocked = await service.unlockApplicant("shared-september-password");

    const first = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Alex Applicant",
      email: "same@example.com",
      linkedinUrl: "https://www.linkedin.com/in/alex-applicant/",
      audioDurationSeconds: 0,
      audioBuffer: Buffer.from("first-private-audio"),
      audioMimeType: "audio/webm;codecs=opus",
    });
    const firstRecord = database.getApplication(first.application.applicationId);
    assert.match(firstRecord.audioStorageKey, /^2026-09\/[0-9a-f-]+\.webm$/);
    assert.equal(firstRecord.audioDurationSeconds, 0);
    assert.equal(existsSync(path.join(storage.audioDirectory, firstRecord.audioStorageKey)), true);

    now = new Date("2026-09-15T10:01:00.000Z");
    const second = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Alex Applicant",
      email: "same@example.com",
      linkedinUrl: "https://linkedin.com/in/alex-applicant/",
      audioDurationSeconds: 60,
      audioBuffer: Buffer.from("second-private-audio"),
      audioMimeType: "audio/ogg",
    });
    const secondRecord = database.getApplication(second.application.applicationId);
    assert.equal(secondRecord.email, firstRecord.email, "duplicate details are deliberately allowed");
    assert.deepEqual(
      service.listPendingApplications().map((application) => application.applicationId),
      [firstRecord.applicationId, secondRecord.applicationId],
    );
    writeFileSync(path.join(storage.audioDirectory, "2026-09", "orphan.private"), "orphan");

    now = new Date("2026-09-15T10:02:00.000Z");
    const passed = await service.decideApplication(firstRecord.applicationId, "pass");
    assert.equal(passed.email.status, "sent");
    assert.equal(database.getApplication(firstRecord.applicationId).emailAttemptCount, 1);
    await assert.rejects(
      service.decideApplication(firstRecord.applicationId, "fail"),
      (error) => error.code === "application_already_decided",
    );
    assert.equal(deliveries.length, 1);

    now = new Date("2026-09-15T10:03:00.000Z");
    const failed = await service.decideApplication(secondRecord.applicationId, "fail");
    assert.equal(failed.email.status, "failed");
    assert.equal(database.getApplication(secondRecord.applicationId).emailAttemptCount, 1);
    await assert.rejects(
      service.decideApplication(secondRecord.applicationId, "fail"),
      (error) => error.code === "application_already_decided",
    );
    assert.equal(deliveries.length, 2, "provider failures are never retried");
    assert.deepEqual(
      service.listProcessedApplications().map((application) => application.applicationId),
      [secondRecord.applicationId, firstRecord.applicationId],
    );

    const octoberActivated = await service.createAndActivateCohort({
      slug: "2026-10",
      displayName: "October 2026",
      password: "shared-october-password",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });
    assert.equal(octoberActivated.current.slug, "2026-10");
    assert.equal(database.getCohortBySlot("next"), null);
    assert.throws(
      () => service.validateApplicantSession(unlocked.sessionPayload),
      (error) => error.code === "applicant_session_expired",
      "an early activation immediately prevents submissions to the previous cohort",
    );

    now = new Date("2026-10-15T10:00:00.000Z");
    const octoberUnlocked = await service.unlockApplicant("shared-october-password");
    const octoberApplication = service.submitApplication({
      sessionPayload: octoberUnlocked.sessionPayload,
      fullName: "October Applicant",
      email: "october@example.com",
      linkedinUrl: "https://linkedin.com/in/october-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("october-private-audio"),
      audioMimeType: "audio/webm",
    });
    await service.decideApplication(octoberApplication.application.applicationId, "pass");
    const perCohortHistory = service.listProcessedApplications(1);
    assert.equal(perCohortHistory.length, 2, "each retained cohort keeps its own history window");
    assert.deepEqual(
      new Set(perCohortHistory.map((application) => application.cohortMonth)),
      new Set(["2026-09", "2026-10"]),
    );

    const activated = await service.createAndActivateCohort({
      slug: "2026-11",
      displayName: "November 2026",
      password: "shared-november-password",
      opensAt: "2026-11-01T00:00",
      closesAt: "2026-11-30T23:59",
    });
    assert.deepEqual(
      [activated.current.slug, activated.previous.slug],
      ["2026-11", "2026-10"],
    );
    assert.equal(database.getCohortById(septemberCohort.cohortId), null);
    assert.equal(database.getApplication(firstRecord.applicationId), null);
    assert.equal(database.getApplication(secondRecord.applicationId), null);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-09")), false);
    assert.equal(service.healthCheck().emailConfigured, true);
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("the application window derives its title and access period from UK opening time", async () => {
  const dataRoot = temporaryDataRoot("recruitment-window-label");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  let now = new Date("2026-09-30T22:59:59.999Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => now,
  });

  try {
    await assert.rejects(
      service.createAndActivateCohort({
        slug: "2027-10",
        displayName: "Incorrect client title",
        password: "invalid-window-password",
        opensAt: "2026-10-04T17:00",
        closesAt: "2026-10-04T17:00",
      }),
      (error) => error.code === "invalid_window",
      "the deadline must still follow the opening time",
    );

    const activated = await service.createAndActivateCohort({
      slug: "2027-10",
      displayName: "Incorrect client title",
      password: "uk-boundary-window",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-04T17:00",
    });
    assert.equal(activated.current.slug, "2026-10");
    assert.equal(activated.current.displayName, "October 2026");
    assert.equal(activated.current.opensAt, "2026-09-30T23:00:00.000Z");
    assert.equal(activated.current.closesAt, "2026-10-04T16:00:00.000Z");

    await assert.rejects(
      service.unlockApplicant("uk-boundary-window"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "the password is invalid immediately before the chosen opening time",
    );

    now = new Date(activated.current.opensAt);
    const unlocked = await service.unlockApplicant("uk-boundary-window");
    assert.equal(unlocked.cohort.slug, "2026-10");

    now = new Date(Date.parse(activated.current.closesAt) - 1);
    assert.equal(
      service.validateApplicantSession(unlocked.sessionPayload).cohort.cohortId,
      activated.current.cohortId,
    );

    now = new Date(activated.current.closesAt);
    await assert.rejects(
      service.unlockApplicant("uk-boundary-window"),
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
      "the password is invalid at the chosen deadline",
    );
    assert.throws(
      () => service.validateApplicantSession(unlocked.sessionPayload),
      (error) => error.code === "applicant_session_expired",
      "an existing applicant session expires at the chosen deadline",
    );
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("application windows keep isolated hidden buckets across same-month and earlier openings", async () => {
  const dataRoot = temporaryDataRoot("recruitment-window-buckets");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  let now = new Date("2026-09-15T12:00:00.000Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => now,
  });

  try {
    const first = await service.createAndActivateCohort({
      password: "first-window-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    const firstSession = await service.unlockApplicant("first-window-password");
    const firstSubmission = service.submitApplication({
      sessionPayload: firstSession.sessionPayload,
      fullName: "First Window Applicant",
      email: "first-window@example.com",
      linkedinUrl: "https://linkedin.com/in/first-window-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("first-window-private-audio"),
      audioMimeType: "audio/webm",
    });
    const firstStored = database.getApplication(firstSubmission.application.applicationId);
    const firstAudioPath = path.join(storage.audioDirectory, firstStored.audioStorageKey);
    assert.equal(existsSync(firstAudioPath), true);
    await service.decideApplication(firstSubmission.application.applicationId, "pass");

    const second = await service.createAndActivateCohort({
      password: "second-window-password",
      opensAt: "2026-09-10T00:00",
      closesAt: "2026-09-20T23:59",
    });
    assert.equal(first.current.slug, "2026-09");
    assert.equal(second.current.slug, "2026-10", "the second window receives a unique hidden bucket");
    assert.equal(second.current.displayName, "September 2026");
    assert.equal(second.previous.cohortId, first.current.cohortId);
    assert.equal(database.getApplication(firstSubmission.application.applicationId)?.cohortId, first.current.cohortId);
    assert.equal(existsSync(firstAudioPath), true, "retained-window audio stays in its own bucket");
    assert.throws(
      () => service.validateApplicantSession(firstSession.sessionPayload),
      (error) => error.code === "applicant_session_expired",
    );

    const secondSession = await service.unlockApplicant("second-window-password");
    const secondSubmission = service.submitApplication({
      sessionPayload: secondSession.sessionPayload,
      fullName: "Second Window Applicant",
      email: "second-window@example.com",
      linkedinUrl: "https://linkedin.com/in/second-window-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("second-window-private-audio"),
      audioMimeType: "audio/webm",
    });
    const secondStored = database.getApplication(secondSubmission.application.applicationId);
    const secondAudioPath = path.join(storage.audioDirectory, secondStored.audioStorageKey);
    assert.equal(existsSync(secondAudioPath), true);
    service.deleteCurrentCohort(second.current.cohortId);
    assert.equal(existsSync(secondAudioPath), false, "only the removed window bucket is deleted");
    assert.equal(existsSync(firstAudioPath), true, "the retained window bucket is not deleted");
    const recreated = await service.createAndActivateCohort({
      slug: "2099-12",
      displayName: "Ignored",
      password: "recreated-window-password",
      opensAt: "2026-09-10T00:00",
      closesAt: "2026-09-20T23:59",
    });
    assert.notEqual(recreated.current.cohortId, second.current.cohortId);
    assert.equal(recreated.current.slug, "2026-10");
    assert.equal(recreated.current.displayName, "September 2026");
    assert.throws(
      () => service.validateApplicantSession(secondSession.sessionPayload),
      (error) => error.code === "applicant_session_expired",
    );
    await assert.rejects(
      service.unlockApplicant("second-window-password"),
      (error) => error.code === "invalid_cohort_password",
    );
    await service.unlockApplicant("recreated-window-password");

    now = new Date("2026-08-15T12:00:00.000Z");
    const earlier = await service.createAndActivateCohort({
      password: "earlier-window-password",
      opensAt: "2026-08-01T00:00",
      closesAt: "2026-08-31T23:59",
    });
    assert.equal(earlier.current.slug, "2026-11", "an earlier opening still gets an isolated bucket");
    assert.equal(earlier.current.displayName, "August 2026");
    await service.unlockApplicant("earlier-window-password");

    const december = await service.createAndActivateCohort({
      password: "december-window-password",
      opensAt: "2026-12-01T00:00",
      closesAt: "2026-12-20T23:59",
    });
    const duplicateDecember = await service.createAndActivateCohort({
      password: "duplicate-december-window-password",
      opensAt: "2026-12-10T00:00",
      closesAt: "2026-12-30T23:59",
    });
    assert.equal(december.current.slug, "2026-12");
    assert.equal(duplicateDecember.current.slug, "2027-01", "hidden buckets roll into a new year");
    assert.equal(duplicateDecember.current.displayName, "December 2026");
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("a database failure removes the just-promoted private audio", () => {
  const dataRoot = temporaryDataRoot("recruitment-cleanup");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const instant = new Date("2026-09-15T10:00:00.000Z");
  const cohort = {
    cohortId: "current-cohort",
    monthKey: "2026-09",
    slot: "current",
    opensAt: "2026-09-01T00:00:00.000Z",
    closesAt: "2026-10-01T00:00:00.000Z",
  };
  const database = {
    getCohortById: () => cohort,
    createApplication() {
      throw new Error("simulated database failure");
    },
  };
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { async sendOutcome() { return { ok: true, providerId: "unused" }; } },
    now: () => instant,
  });

  try {
    assert.throws(() => service.submitApplication({
      sessionPayload: {
        v: 1,
        kind: "applicant",
        cohortId: cohort.cohortId,
        exp: Math.floor(Date.parse(cohort.closesAt) / 1000),
      },
      fullName: "Cleanup Test",
      email: "cleanup@example.com",
      linkedinUrl: "https://linkedin.com/in/cleanup-test/",
      audioDurationSeconds: 0,
      audioBuffer: Buffer.from("private-audio"),
      audioMimeType: "audio/webm",
    }), /simulated database failure/);
    assert.equal(existsSync(path.join(storage.audioDirectory, cohort.monthKey)), false);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("cohort activation is blocked while applications are still waiting", () => {
  let quarantineCalled = false;
  const service = createRecruitmentService({
    database: {
      previewActivateNext: () => ({
        expectedNextId: "next",
        expectedCurrentId: "current",
        purgeCohortMonths: [],
      }),
      getCohortBySlot: () => ({ cohortId: "current", pendingCount: 1 }),
    },
    storage: {
      quarantineCohorts() {
        quarantineCalled = true;
        return { moved: [] };
      },
    },
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
  });

  assert.throws(
    () => service.activateNextCohort("next"),
    (error) => error.code === "current_cohort_has_pending_applications",
  );
  assert.equal(quarantineCalled, false);
});

test("one-step activation blocks pending work and deleting the active cohort closes access", async () => {
  const dataRoot = temporaryDataRoot("recruitment-one-step");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  let now = new Date("2026-09-15T10:00:00.000Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: {
      configured: true,
      async sendOutcome() { return { ok: true, providerId: "one-step-test" }; },
    },
    now: () => now,
  });

  try {
    const september = await service.createAndActivateCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    const septemberSession = await service.unlockApplicant("shared-september-password");
    const septemberSubmission = service.submitApplication({
      sessionPayload: septemberSession.sessionPayload,
      fullName: "September Applicant",
      email: "september@example.com",
      linkedinUrl: "https://linkedin.com/in/september-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("september-private-audio"),
      audioMimeType: "audio/webm",
    });
    await service.decideApplication(septemberSubmission.application.applicationId, "pass");

    const october = await service.createAndActivateCohort({
      slug: "2026-10",
      displayName: "October 2026",
      password: "shared-october-password",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });
    now = new Date("2026-10-15T10:00:00.000Z");
    const octoberSession = await service.unlockApplicant("shared-october-password");
    const octoberSubmission = service.submitApplication({
      sessionPayload: octoberSession.sessionPayload,
      fullName: "October Applicant",
      email: "october@example.com",
      linkedinUrl: "https://linkedin.com/in/october-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("october-private-audio"),
      audioMimeType: "audio/webm",
    });
    writeFileSync(path.join(storage.audioDirectory, "2026-10", "orphan.private"), "orphan");

    await assert.rejects(
      service.createAndActivateCohort({
        slug: "2026-11",
        displayName: "November 2026",
        password: "shared-november-password",
        opensAt: "2026-11-01T00:00",
        closesAt: "2026-11-30T23:59",
      }),
      (error) => error.code === "current_cohort_has_pending_applications" && error.statusCode === 409,
    );
    assert.equal(database.getCohortBySlot("current").cohortId, october.current.cohortId);
    assert.equal(database.getCohortBySlot("next"), null, "a failed one-step action leaves no draft cohort");
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-10", "orphan.private")), true);

    assert.throws(
      () => service.deleteCurrentCohort("not-the-active-cohort"),
      (error) => error.code === "cohort_delete_target_mismatch" && error.statusCode === 409,
    );
    assert.equal(database.getCohortBySlot("current").cohortId, october.current.cohortId);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-10", "orphan.private")), true);

    const deleted = service.deleteCurrentCohort(october.current.cohortId);
    assert.equal(deleted.deletedCohortId, october.current.cohortId);
    assert.equal(database.getCohortBySlot("current"), null);
    assert.equal(database.getCohortBySlot("previous").cohortId, september.current.cohortId);
    assert.equal(database.getApplication(octoberSubmission.application.applicationId), null);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-10")), false);
    assert.throws(
      () => service.validateApplicantSession(octoberSession.sessionPayload),
      (error) => error.code === "applicant_session_expired",
    );
    assert.equal(service.getApplicantStatus(octoberSession.sessionPayload).state, "unavailable");

    const november = await service.createAndActivateCohort({
      slug: "2026-11",
      displayName: "November 2026",
      password: "shared-november-password",
      opensAt: "2026-11-01T00:00",
      closesAt: "2026-11-30T23:59",
    });
    assert.equal(november.current.slug, "2026-11");
    assert.equal(november.previous.cohortId, september.current.cohortId);

    service.deleteCurrentCohort(november.current.cohortId);
    const decemberDraft = await service.createNextCohort({
      slug: "2026-12",
      displayName: "December 2026",
      password: "shared-december-password",
      opensAt: "2026-12-01T00:00",
      closesAt: "2026-12-31T23:59",
    });
    const december = service.activateNextCohort(decemberDraft.cohortId);
    assert.equal(december.current.slug, "2026-12");
    assert.equal(
      december.previous.cohortId,
      september.current.cohortId,
      "legacy activation must retain previous history when no current cohort exists",
    );
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("one-step activation restores quarantined recordings if the database transition fails", async () => {
  const dataRoot = temporaryDataRoot("recruitment-one-step-rollback");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  mkdirSync(path.join(storage.audioDirectory, "2026-09"), { recursive: true });
  const privateAudioPath = path.join(storage.audioDirectory, "2026-09", "private-recording.webm");
  writeFileSync(privateAudioPath, "private-audio");
  const service = createRecruitmentService({
    database: {
      previewCreateAndActivate: () => ({
        purgeCohortMonths: ["2026-09"],
        purgeAudioStorageKeys: ["2026-09/private-recording.webm"],
      }),
      createAndActivateCohort() { throw new Error("simulated activation failure"); },
    },
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => new Date("2026-10-01T10:00:00.000Z"),
  });

  try {
    await assert.rejects(
      service.createAndActivateCohort({
        slug: "2026-10",
        displayName: "October 2026",
        password: "shared-october-password",
        opensAt: "2026-10-01T00:00",
        closesAt: "2026-10-31T23:59",
      }),
      /simulated activation failure/,
    );
    assert.equal(readFileSync(privateAudioPath, "utf8"), "private-audio");
    assert.deepEqual(readdirSync(path.join(dataRoot, ".trash")), []);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("active-cohort deletion restores the full recording folder if the database transition fails", () => {
  const dataRoot = temporaryDataRoot("recruitment-delete-rollback");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  mkdirSync(path.join(storage.audioDirectory, "2026-10"), { recursive: true });
  const privateAudioPath = path.join(storage.audioDirectory, "2026-10", "private-recording.webm");
  const orphanPath = path.join(storage.audioDirectory, "2026-10", "orphan.private");
  writeFileSync(privateAudioPath, "private-audio");
  writeFileSync(orphanPath, "orphan-audio");
  const service = createRecruitmentService({
    database: {
      previewDeleteCurrentCohort: () => ({
        expectedCurrentId: "current",
        monthKey: "2026-10",
        audioStorageKeys: ["2026-10/private-recording.webm"],
      }),
      deleteCurrentCohort() { throw new Error("simulated deletion failure"); },
    },
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
  });

  try {
    assert.throws(() => service.deleteCurrentCohort("current"), /simulated deletion failure/);
    assert.equal(readFileSync(privateAudioPath, "utf8"), "private-audio");
    assert.equal(readFileSync(orphanPath, "utf8"), "orphan-audio");
    assert.deepEqual(readdirSync(path.join(dataRoot, ".trash")), []);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("a committed cohort transition is not reported as failed when trash cleanup is deferred", async () => {
  const current = {
    cohortId: "new-current",
    monthKey: "2026-10",
    displayName: "October 2026",
    slot: "current",
    opensAt: "2026-09-30T22:00:00.000Z",
    closesAt: "2026-10-31T22:59:00.000Z",
    applicationCount: 0,
    pendingCount: 0,
    processedCount: 0,
  };
  let cleanupAttempts = 0;
  const service = createRecruitmentService({
    database: {
      previewCreateAndActivate: () => ({ purgeCohortMonths: [], purgeAudioStorageKeys: [] }),
      createAndActivateCohort: () => ({ current, previous: null, purgedCohortIds: [] }),
      previewDeleteCurrentCohort: () => ({
        expectedCurrentId: current.cohortId,
        monthKey: current.monthKey,
        audioStorageKeys: [],
      }),
      deleteCurrentCohort: () => ({
        deletedCohortId: current.cohortId,
        deletedMonthKey: current.monthKey,
      }),
    },
    storage: {
      quarantineCohorts: () => ({ operationDirectory: "/private/quarantine" }),
      rollbackQuarantine() {},
      commitQuarantine() {
        cleanupAttempts += 1;
        throw new Error("simulated post-commit cleanup failure");
      },
    },
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => new Date("2026-10-15T10:00:00.000Z"),
  });

  const activated = await service.createAndActivateCohort({
    slug: "2026-10",
    displayName: "October 2026",
    password: "shared-october-password",
    opensAt: "2026-10-01T00:00",
    closesAt: "2026-10-31T23:59",
  });
  assert.equal(activated.current.cohortId, current.cohortId);
  assert.equal(service.deleteCurrentCohort(current.cohortId).deletedCohortId, current.cohortId);
  assert.equal(cleanupAttempts, 2);
});

test("applicant unlock rechecks the active cohort after password verification", async () => {
  const dataRoot = temporaryDataRoot("recruitment-unlock-race");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  const now = new Date("2026-09-15T10:00:00.000Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => now,
  });

  try {
    const september = await service.createAndActivateCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    const unlock = service.unlockApplicant("shared-september-password");
    service.deleteCurrentCohort(september.current.cohortId);
    await assert.rejects(
      unlock,
      (error) => error.code === "cohort_not_open" && error.statusCode === 403,
    );
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("a missing outcome-email configuration cannot consume a decision", async () => {
  let decisionCalled = false;
  const service = createRecruitmentService({
    database: {
      decideApplication() {
        decisionCalled = true;
      },
    },
    storage: {},
    emailSender: { configured: false, async sendOutcome() { return { ok: false }; } },
  });

  await assert.rejects(
    service.decideApplication("application", "pass"),
    (error) => error.code === "outcome_email_not_configured" && error.statusCode === 503,
  );
  assert.equal(decisionCalled, false);
});

test("production health requires an explicit Website-volume acknowledgement", () => {
  assert.throws(
    () => resolveRecruitmentDataRoot({
      NODE_ENV: "production",
      RECRUITMENT_DATA_ROOT: "/some-other-service/recruitment",
    }),
    (error) => error.code === "invalid_data_root",
  );
  assert.equal(
    resolveRecruitmentDataRoot({ NODE_ENV: "production", RECRUITMENT_DATA_ROOT: "/data/recruitment" }),
    "/data/recruitment",
  );
  const dataRoot = temporaryDataRoot("recruitment-volume-gate");
  try {
    const unacknowledged = createRecruitmentStorage({
      dataRoot,
      projectRoot: process.cwd(),
      env: { NODE_ENV: "production" },
    });
    unacknowledged.initialize();
    assert.equal(unacknowledged.healthCheck().ok, false);

    const acknowledged = createRecruitmentStorage({
      dataRoot,
      projectRoot: process.cwd(),
      env: {
        NODE_ENV: "production",
        RECRUITMENT_PERSISTENCE_ACK: "website-volume-mounted",
      },
    });
    assert.equal(acknowledged.healthCheck().ok, true);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("startup recovery restores referenced quarantine audio and removes orphans", async () => {
  const dataRoot = temporaryDataRoot("recruitment-recovery");
  const storage = createRecruitmentStorage({ dataRoot, projectRoot: process.cwd() });
  storage.initialize();
  const database = createRecruitmentDatabase({ databasePath: storage.databasePath });
  const now = new Date("2026-09-15T10:00:00.000Z");
  const service = createRecruitmentService({
    database,
    storage,
    emailSender: { configured: true, async sendOutcome() { return { ok: true }; } },
    now: () => now,
  });

  try {
    const draft = await service.createNextCohort({
      slug: "2026-09",
      displayName: "September 2026",
      password: "shared-september-password",
      opensAt: "2026-09-01T00:00",
      closesAt: "2026-09-30T23:59",
    });
    service.activateNextCohort(draft.cohortId);
    const unlocked = await service.unlockApplicant("shared-september-password");
    const submitted = service.submitApplication({
      sessionPayload: unlocked.sessionPayload,
      fullName: "Recovery Applicant",
      email: "recovery@example.com",
      linkedinUrl: "https://linkedin.com/in/recovery-applicant/",
      audioDurationSeconds: 1,
      audioBuffer: Buffer.from("referenced-audio"),
      audioMimeType: "audio/webm",
    });
    const record = database.getApplication(submitted.application.applicationId);
    writeFileSync(path.join(dataRoot, ".staging", "interrupted.pending"), "orphan");
    writeFileSync(path.join(storage.audioDirectory, "2026-09", "orphan.webm"), "orphan");
    storage.quarantineCohorts(["2026-09"]);

    const recovered = storage.recoverInterruptedOperations(
      database.listCohortMonthKeys(),
      database.listAudioStorageKeys(),
    );
    assert.equal(recovered.restoredAudioCount, 2);
    assert.equal(existsSync(path.join(storage.audioDirectory, record.audioStorageKey)), true);
    assert.equal(existsSync(path.join(storage.audioDirectory, "2026-09", "orphan.webm")), false);
    assert.deepEqual(readdirSync(path.join(dataRoot, ".staging")), []);
    assert.deepEqual(readdirSync(path.join(dataRoot, ".trash")), []);
  } finally {
    database.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("HTTP routes match the Website clients, exchange reviewer secret, range-stream, and serve the SPA", async () => {
  const fixtureRoot = temporaryDataRoot("recruitment-http");
  const staticRoot = path.join(fixtureRoot, "site");
  mkdirSync(path.join(staticRoot, "generated"), { recursive: true });
  mkdirSync(path.join(staticRoot, "assets"), { recursive: true });
  writeFileSync(path.join(staticRoot, "index.html"), "<main>website-index</main>");
  writeFileSync(path.join(staticRoot, "generated", "index.html"), "<main>generated-route</main>");
  writeFileSync(path.join(staticRoot, "assets", "asset.txt"), "asset-body");
  const audioPath = path.join(fixtureRoot, "audio.webm");
  writeFileSync(audioPath, "0123456789");

  let submitted;
  let activatedId;
  let createdAndActivated;
  let deletedId;
  const currentCohort = {
    id: "current",
    cohortId: "current",
    slug: "2026-09",
    pendingCount: 7,
    processedCount: 11,
  };
  const previousCohort = {
    id: "previous",
    cohortId: "previous",
    slug: "2026-08",
    processedCount: 13,
  };
  const queue = [{ id: "application-one", applicationId: "application-one" }];
  const history = [{ id: "application-old", applicationId: "application-old", decision: "pass" }];
  const service = {
    healthCheck: () => ({ ok: true }),
    getApplicantStatus: () => ({ unlocked: false, state: "open", cohort: currentCohort }),
    async unlockApplicant() {
      return {
        cohort: currentCohort,
        expiresAt: new Date(Date.now() + 60_000),
        sessionPayload: { v: 1, kind: "applicant", cohortId: "current", exp: Math.floor(Date.now() / 1000) + 60 },
      };
    },
    validateApplicantSession(payload) {
      if (!payload) {
        throw Object.assign(new Error("Application access has expired."), {
          code: "applicant_session_expired",
          statusCode: 401,
        });
      }
      return { cohort: currentCohort };
    },
    submitApplication(input) {
      submitted = input;
      return { ok: true, application: { applicationId: "submitted" } };
    },
    listPendingApplications: () => queue,
    listProcessedApplications: () => history,
    listCohortControls: () => ({ current: currentCohort, previous: previousCohort, next: null }),
    getReviewerAudio: () => ({ filePath: audioPath, fileSize: 10, mimeType: "audio/webm" }),
    async decideApplication() { return { application: history[0], email: { status: "sent" } }; },
    async createNextCohort(input) { return { id: "next", cohortId: "next", slug: input.slug }; },
    async createAndActivateCohort(input) {
      createdAndActivated = input;
      return {
        current: {
          id: "new-current",
          cohortId: "new-current",
          slug: "2026-10",
          displayName: "October 2026",
          opensAt: "2026-09-30T23:00:00.000Z",
          closesAt: "2026-10-31T23:59:00.000Z",
        },
        previous: currentCohort,
      };
    },
    deleteCurrentCohort(id) {
      deletedId = id;
      return { deletedCohortId: id, deletedMonthKey: "2026-09", deletedAudioCount: 1 };
    },
    activateNextCohort(id) { activatedId = id; return { current: { id }, previous: currentCohort }; },
  };
  const app = await createRecruitmentApp({
    service,
    cookieCodec: createSignedCookieCodec("http-test-cookie-secret-is-at-least-32-bytes"),
    reviewerSecret: "ABCDEFGHIJKL",
    secureCookies: false,
    audioInspector: async () => ({ durationSeconds: 0 }),
    staticDirectory: staticRoot,
  });
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", (error) => {
      if (error) reject(error);
      else resolve(listening);
    });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const status = await fetch(`${baseUrl}/api/recruitment/status`);
    assert.equal((await status.json()).state, "open");

    const anonymousMultipart = new FormData();
    anonymousMultipart.append("audio", new Blob(["anonymous"], { type: "audio/webm" }), "anonymous.webm");
    const anonymousSubmission = await fetch(`${baseUrl}/api/recruitment/applications`, {
      method: "POST",
      body: anonymousMultipart,
    });
    assert.equal(anonymousSubmission.status, 401, "anonymous uploads are rejected before parsing audio");
    assert.equal(submitted, undefined);

    const unlock = await fetch(`${baseUrl}/api/recruitment/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "shared" }),
    });
    assert.equal(unlock.status, 200);
    const applicantCookie = unlock.headers.get("set-cookie").split(";", 1)[0];

    const multipart = new FormData();
    multipart.append("fullName", "HTTP Applicant");
    multipart.append("email", "http@example.com");
    multipart.append("linkedin", "https://linkedin.com/in/http-applicant/");
    multipart.append("audioDurationMs", "0");
    multipart.append("audio", new Blob(["voice"], { type: "audio/webm" }), "client-name.webm");
    const submission = await fetch(`${baseUrl}/api/recruitment/applications`, {
      method: "POST",
      headers: { Cookie: applicantCookie },
      body: multipart,
    });
    assert.equal(submission.status, 201);
    assert.equal(submitted.linkedinUrl, "https://linkedin.com/in/http-applicant/");
    assert.equal(submitted.audioDurationSeconds, 0);

    const exchange = await fetch(`${baseUrl}/assessment/ABCDEFGHIJKL`, { redirect: "manual" });
    assert.equal(exchange.status, 303);
    assert.equal(exchange.headers.get("location"), "/assessment");
    assert.equal(exchange.headers.get("referrer-policy"), "no-referrer");
    assert.match(exchange.headers.get("cache-control"), /no-store/);
    const reviewerCookie = exchange.headers.get("set-cookie").split(";", 1)[0];

    const unauthenticatedState = await fetch(`${baseUrl}/api/recruitment/reviewer/state`);
    assert.equal(unauthenticatedState.status, 401);

    const state = await fetch(`${baseUrl}/api/recruitment/reviewer/state`, {
      headers: { Cookie: reviewerCookie },
    });
    const statePayload = await state.json();
    assert.equal(statePayload.authenticated, true);
    assert.equal(statePayload.current.applicationId, "application-one");
    assert.deepEqual(statePayload.history, history);
    assert.equal(statePayload.pendingTotal, 7);
    assert.equal(statePayload.processedTotal, 24);

    const created = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "shared",
        opensAt: "2026-10-01T00:00",
        closesAt: "2026-10-31T23:59",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).cohort.slug, "2026-10");
    assert.deepEqual(createdAndActivated, {
      password: "shared",
      opensAt: "2026-10-01T00:00",
      closesAt: "2026-10-31T23:59",
    });

    const anonymousDelete = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/current`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(anonymousDelete.status, 401);
    assert.equal(deletedId, undefined);

    const unconfirmedDelete = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/current`, {
      method: "DELETE",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmedDelete.status, 400);
    assert.equal(deletedId, undefined);

    const confirmedDelete = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/current`, {
      method: "DELETE",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(confirmedDelete.status, 200);
    assert.equal((await confirmedDelete.json()).deletedCohortId, "current");
    assert.equal(deletedId, "current");

    const audio = await fetch(`${baseUrl}/api/recruitment/reviewer/applications/application-one/audio`, {
      headers: { Cookie: reviewerCookie, Range: "bytes=2-5" },
    });
    assert.equal(audio.status, 206);
    assert.equal(audio.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await audio.text(), "2345");

    const unconfirmed = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/next/activate`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmed.status, 400);
    const unconfirmedAlias = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/activate-next`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(unconfirmedAlias.status, 400);
    const activation = await fetch(`${baseUrl}/api/recruitment/reviewer/cohorts/next/activate`, {
      method: "POST",
      headers: { Cookie: reviewerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(activation.status, 200);
    assert.equal(activatedId, "next");

    assert.equal(await (await fetch(`${baseUrl}/`)).text(), "<main>website-index</main>");
    assert.equal(await (await fetch(`${baseUrl}/generated/`)).text(), "<main>generated-route</main>");
    assert.equal(await (await fetch(`${baseUrl}/assets/asset.txt`)).text(), "asset-body");
    assert.equal(await (await fetch(`${baseUrl}/client-side-route`)).text(), "<main>website-index</main>");
    assert.equal(readFileSync(audioPath, "utf8"), "0123456789");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
