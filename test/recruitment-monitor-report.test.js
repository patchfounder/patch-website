import assert from "node:assert/strict";
import test from "node:test";
import { buildRecruitmentMonitoringReport as build } from "../scripts/recruitment-monitor-report.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const application = (n, fields = {}) => ({
  applicationId: id(n), fullName: `Synthetic Applicant ${n}`,
  submittedAt: "2026-11-02T09:00:00.000Z", audioDurationSeconds: 30,
  decision: "pending", reviewedAt: "", teamDecision: "", teamDecidedAt: "",
  emailStatus: "not_attempted", emailAttemptedAt: "", emailAttemptCount: 0, audioFileSize: 200,
  ...fields,
});
function pages(rows, size = 100) {
  const totals = {
    total: rows.length, pending: rows.filter((a) => a.decision === "pending").length,
    pass: rows.filter((a) => a.decision === "pass").length, fail: rows.filter((a) => a.decision === "fail").length,
    invited: rows.filter((a) => a.teamDecision === "invited").length,
    rejected: rows.filter((a) => a.teamDecision === "rejected").length,
    emailFailed: rows.filter((a) => a.emailStatus === "failed").length,
  };
  const output = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += size) output.push({
    ok: true, applications: rows.slice(i, i + size), totals,
    hasMore: i + size < rows.length, nextCursor: i + size < rows.length ? `cursor-${i}` : null,
    observedAt: "2026-11-02T10:00:00.000Z",
  });
  return output;
}

test("baseline presents a human review queue; state holds IDs/fingerprints without identity, contact or audio", () => {
  const result = build({ pages: pages([application(1), application(2, { decision: "pass" })], 1) });
  assert.equal(result.report.baseline, true);
  assert.equal(result.report.newApplications.length, 0);
  assert.equal(result.report.awaitingReview.length, 1);
  assert.equal(result.report.awaitingTeamDecision.length, 1);
  assert.equal(result.report.awaitingReview[0].reviewUrl, "https://www.patch.app/assessment");
  assert.doesNotMatch(JSON.stringify(result.nextState), /Synthetic|fullName|email|audio|cursor/i);
});

test("the native Patch Admin MCP structured response is accepted; unavailable reads are never an empty queue", () => {
  const mcpPages = pages([application(1)]).map(({ ok, ...page }) => ({
    ...page, status: "read", reviewUrl: "https://www.patch.app/assessment",
  }));
  assert.equal(build({ pages: mcpPages }).report.totals.pending, 1);
  assert.throws(() => build({ pages: [{ status: "unavailable", applications: [],
    totals: pages([])[0].totals, observedAt: "2026-11-02T10:00:00.000Z", hasMore: false, nextCursor: null }] }));
});

test("full rescans catch lower UUIDs inserted at the same timestamp and changed outcomes; unchanged polls stay quiet", () => {
  const original = [application(9)];
  const baseline = build({ pages: pages(original) }).nextState;
  assert.equal(build({ pages: pages(original), previous: baseline }).report.hasChanges, false);
  const after = build({ pages: pages([
    application(1), application(9, { decision: "pass", reviewedAt: "2026-11-02T09:05:00.000Z" }),
  ], 1), previous: baseline });
  assert.deepEqual(after.report.newApplications.map((a) => a.applicationId), [id(1)]);
  assert.deepEqual(after.report.changedApplications.map((a) => a.applicationId), [id(9)]);
  assert.equal(build({ pages: pages([
    application(1), application(9, { decision: "pass", reviewedAt: "2026-11-02T09:05:00.000Z" }),
  ]), previous: after.nextState }).report.hasChanges, false);
});

test("submissions reviewed before the next poll are still reported; email failures only request human attention", () => {
  const previous = build({ pages: pages([]) }).nextState;
  const rows = [application(1, { decision: "fail", emailStatus: "failed" }),
    application(2, { decision: "pass", teamDecision: "invited", emailStatus: "sent" })];
  const result = build({ pages: pages(rows), previous });
  assert.equal(result.report.newApplications.length, 2);
  assert.equal(result.report.emailFailures.length, 1);
  assert.match(result.report.emailFailures[0].nextAction, /do not resend automatically/);
  assert.equal(result.report.awaitingReview.length, 0);
});

test("incomplete, repeated, inconsistent and changing pages fail without mutating the previous checkpoint", () => {
  const previous = build({ pages: pages([application(8)]) }).nextState;
  const original = structuredClone(previous);
  const good = pages([application(1), application(2)], 1);
  const cases = [good.slice(0, 1), [good[0], { ...good[1], applications: good[0].applications }],
    [good[0], { ...good[1], totals: { ...good[1].totals, total: 3 } }],
    [{ ...good[1], applications: [], totals: good[1].totals }],
    [{ ...good[1], applications: [application(1, { decision: "unrecognised" })] }]];
  for (const input of cases) assert.throws(() => build({ pages: input, previous }));
  assert.deepEqual(previous, original);
});

test("removed retained records are not labelled failed, withdrawn or rejected", () => {
  const previous = build({ pages: pages([application(1)]) }).nextState;
  const result = build({ pages: pages([]), previous });
  assert.deepEqual(result.report.noLongerInRetainedRecords, [id(1)]);
  assert.equal(result.report.totals.fail, 0);
  assert.equal(result.report.totals.rejected, 0);
  assert.equal(result.nextState.seen[id(1)], previous.seen[id(1)]);
});
