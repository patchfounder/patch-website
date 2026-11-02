import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOTALS = ["total", "pending", "pass", "fail", "invited", "rejected", "emailFailed"];
const CHANGES = ["decision", "reviewedAt", "teamDecision", "teamDecidedAt", "emailStatus",
  "emailAttemptedAt", "emailAttemptCount", "audioFileSize", "audioDurationSeconds"];

function assert(condition, message) { if (!condition) throw new Error(message); }
function fingerprint(application) {
  return createHash("sha256").update(JSON.stringify(CHANGES.map((field) => application[field] ?? ""))).digest("hex");
}
function normalTotals(value) {
  assert(value && TOTALS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0), "Invalid application totals.");
  return Object.fromEntries(TOTALS.map((key) => [key, value[key]]));
}
function nextAction(application) {
  if (application.decision === "pending") return "Listen to the recording and decide Stage 1.";
  if (application.emailStatus === "failed") return "Review the recorded email failure; do not resend automatically.";
  if (application.decision === "pass" && !application.teamDecision) return "Awaiting your team-stage decision.";
  return "No automatic action.";
}
function card(application) {
  return {
    applicationId: application.applicationId, fullName: application.fullName,
    submittedAt: application.submittedAt, audioDurationSeconds: application.audioDurationSeconds,
    decision: application.decision, teamDecision: application.teamDecision,
    emailStatus: application.emailStatus, nextAction: nextAction(application),
    reviewUrl: "https://www.patch.app/assessment",
  };
}

// Pure transformation of MCP results. This never contacts Website, opens SQLite,
// fetches audio, writes files, records decisions or sends applicant messages.
export function buildRecruitmentMonitoringReport({ pages, previous = null }) {
  assert(Array.isArray(pages) && pages.length > 0 && pages.length <= 1000, "A complete bounded application scan is required.");
  if (previous !== null) {
    assert(previous?.version === 1 && previous.seen && typeof previous.seen === "object"
      && !Array.isArray(previous.seen) && Array.isArray(previous.currentIds), "Invalid previous monitoring checkpoint.");
    assert(Object.keys(previous.seen).every((id) => UUID.test(id))
      && Object.values(previous.seen).every((hash) => /^[0-9a-f]{64}$/.test(hash))
      && previous.currentIds.every((id) => UUID.test(id)), "Invalid checkpoint identity or fingerprint.");
  }
  const applications = [];
  const ids = new Set();
  const cursors = new Set();
  const totals = normalTotals(pages[0].totals);
  for (const [index, page] of pages.entries()) {
    assert((page?.status === "read" || page?.ok === true)
      && Array.isArray(page.applications) && page.applications.length <= 100,
      "Invalid recruitment MCP page.");
    assert(Number.isFinite(Date.parse(page.observedAt)), "Missing observation time.");
    assert(JSON.stringify(normalTotals(page.totals)) === JSON.stringify(totals),
      "Applications changed during the scan. Start a fresh scan; preserve the checkpoint.");
    const last = index === pages.length - 1;
    assert(typeof page.hasMore === "boolean" && page.hasMore === !last,
      "Incomplete application scan. Preserve the checkpoint.");
    assert(last ? page.nextCursor === null : typeof page.nextCursor === "string" && page.nextCursor.length > 0,
      "Invalid pagination completion.");
    if (!last) {
      assert(!cursors.has(page.nextCursor), "Repeated pagination cursor. Preserve the checkpoint.");
      cursors.add(page.nextCursor);
    }
    for (const application of page.applications) {
      assert(UUID.test(String(application.applicationId || "")) && !ids.has(application.applicationId),
        "Invalid or duplicate application ID. Preserve the checkpoint.");
      assert(typeof application.fullName === "string" && application.fullName.length > 0 && application.fullName.length <= 200,
        "Invalid applicant display name.");
      assert(["pending", "pass", "fail"].includes(application.decision)
        && ["", "invited", "rejected"].includes(application.teamDecision)
        && (application.decision === "pass" || application.teamDecision === ""), "Invalid application outcome.");
      assert(["not_attempted", "attempting", "sent", "failed"].includes(application.emailStatus), "Invalid email status.");
      assert(Number.isFinite(Date.parse(application.submittedAt))
        && Number.isFinite(application.audioDurationSeconds)
        && application.audioDurationSeconds >= 0 && application.audioDurationSeconds <= 60, "Invalid submission metadata.");
      ids.add(application.applicationId);
      applications.push(application);
    }
  }
  assert(applications.length === totals.total, "Application scan does not match the total. Preserve the checkpoint.");
  const actual = {
    total: applications.length,
    pending: applications.filter((a) => a.decision === "pending").length,
    pass: applications.filter((a) => a.decision === "pass").length,
    fail: applications.filter((a) => a.decision === "fail").length,
    invited: applications.filter((a) => a.teamDecision === "invited").length,
    rejected: applications.filter((a) => a.teamDecision === "rejected").length,
    emailFailed: applications.filter((a) => a.emailStatus === "failed").length,
  };
  assert(JSON.stringify(actual) === JSON.stringify(totals), "Application outcomes changed during the scan. Preserve the checkpoint.");
  const oldSeen = previous?.seen || {};
  const newApplications = previous ? applications.filter((a) => !Object.hasOwn(oldSeen, a.applicationId)) : [];
  const changedApplications = previous ? applications.filter((a) => Object.hasOwn(oldSeen, a.applicationId)
    && oldSeen[a.applicationId] !== fingerprint(a)) : [];
  const missingIds = (previous?.currentIds || []).filter((id) => !ids.has(id));
  const observedAt = pages.at(-1).observedAt;
  return {
    report: {
      baseline: previous === null, observedAt, totals,
      hasChanges: previous === null || newApplications.length > 0 || changedApplications.length > 0 || missingIds.length > 0,
      newApplications: newApplications.map(card), changedApplications: changedApplications.map(card),
      awaitingReview: applications.filter((a) => a.decision === "pending").map(card),
      awaitingTeamDecision: applications.filter((a) => a.decision === "pass" && !a.teamDecision).map(card),
      emailFailures: applications.filter((a) => a.emailStatus === "failed").map(card),
      noLongerInRetainedRecords: missingIds,
    },
    nextState: {
      version: 1, observedAt,
      seen: { ...oldSeen, ...Object.fromEntries(applications.map((a) => [a.applicationId, fingerprint(a)])) },
      currentIds: applications.map((a) => a.applicationId),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("Monitoring input is too large.");
      chunks.push(chunk);
    }
    process.stdout.write(`${JSON.stringify(buildRecruitmentMonitoringReport(JSON.parse(Buffer.concat(chunks).toString("utf8"))))}\n`);
  } catch {
    // Do not echo applicant input, credential-like fields or local file paths.
    process.stderr.write("Recruitment monitoring report failed validation; preserve the previous checkpoint and retry a complete scan.\n");
    process.exitCode = 1;
  }
}
