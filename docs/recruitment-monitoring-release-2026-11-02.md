# Recruitment monitoring — release handoff, 2 November 2026

## Release authorisation update

Patrick explicitly authorised committing, pushing and deploying the reviewed monitoring changes and configuring their dedicated read-only connection on 2 November 2026. This supersedes the historical local-only hold below for this exact feature; the bounded exception is recorded in AGENTS.md. New OAuth consent and successful live MCP verification remain required before activation.

Release preparation found unrelated dirty work in both repositories. Website rejection-copy changes are excluded. Patch OS requires a completely clean canonical main working folder, so its production push must remain blocked until that gate can pass without resetting, stashing, overwriting or including unrelated work. No exception to that gate is inferred from release approval.

## Reason

Patrick wants new application submissions and human review progress monitored, with private recordings available for him to listen and decide pass/fail. The existing Patch Admin MCP did not expose Website recruitment records.

## Expected outcome

After a separately approved release and OAuth consent, Patch Admin can read completed applications, exact current statuses and private recordings. Hourly checks and a daily review brief use complete scans and stable IDs, with no recruitment decisions or applicant communications.

## Scope and invariants

Patrick requested the build and explicitly authorised a bounded local Patch OS adapter/test exception to Website isolation. The exception is recorded in Website AGENTS.md. Patch OS has been inspected and changed within that authorised adapter/OAuth/tests scope. No production resources, live applications or credentials were inspected or changed. No release actions are authorised yet.

Website changes:

- `server/recruitment-monitor.js`: optional, independently authenticated read-only routes, strict inputs, allowlisted DTOs and private audio routing.
- `server/recruitment-db.js`: two SELECT-only reader methods and their fixed-filter query helper. No schema/migration changes.
- `server/app.js`: attach the new reader to the existing runtime and private audio stream helper; dedicated server-only token configuration. Audio stream errors and disconnects are isolated so a recording removed after stat cannot crash the service; normal full/range response behaviour is preserved.
- `scripts/recruitment-monitor-report.mjs`: pure complete-scan validator and ID/outcome comparison, with minimal private checkpoints. No network, SQLite, audio fetch, file writes, decisions or emails.
- `test/recruitment-monitor.test.js`, `test/recruitment-monitor-report.test.js` and `test/recruitment-monitor-stream.test.js`: synthetic invariance/security, report and lost-recording stream tests.
- `AGENTS.md` and recruitment monitoring documentation: exact local authorisation, method and activation boundaries.

Applicant/reviewer authentication, passwords, submission/assessment UI, Pass/Fail/team behaviour, existing emails, registration and private audio storage remain intact. The monitor credential cannot establish a reviewer session or authorise existing writes. Audio and sensitive provider/storage/password fields are not exposed in JSON. Routine hourly/daily monitoring does not fetch recordings or score candidates.

## Validation

- Website `npm test`: **144/144 passed**, including the new endpoint tests and the original five report-helper tests. Existing assessment, registration, outcome email and auth regressions passed using synthetic fixtures.
- The report helper was then updated for the actual MCP `status: read` DTO; its final focused suite is **6/6 passed**, including the added native-MCP contract case. No unrelated Website code changed after the full suite.
- Final private-audio stream hardening was verified with the endpoint/backend regressions: **26/26 passed**, including lost-at-open request failure followed by a successful request, existing private audio ranges, auth and unchanged database/audio. The independent Planner reviewed this final addition and found no blocking issue.
- Website `npm run build`: passed; Vite built the client and generated 15 route metadata pages.
- `git diff --check`: passed.
- Isolated real-contract check: real Website runtime with a temporary synthetic database/audio, real loopback HTTP requests through the Patch Admin adapter, native MCP audio formatting and the report helper. Pagination, non-LinkedIn HTTP profile compatibility, private audio bytes, unchanged polls and human-outcome changes all passed. No live records, provider credentials, email sends or operational APIs were used.
- Patch OS focused OAuth/MCP/adapter/ICS checks passed **127/127**; the final exact file list is recorded in `Patch OS/docs/releases/admin-recruitment-monitor-read-mcp-2026-11-02.md`.

Loopback HTTP tests needed sandbox escalation because sandbox listeners returned `EPERM`; the approved test runs used only synthetic temporary fixtures. No browser automation was used.

## Prepared monitoring

Both thread tasks were created through the app and their saved states verified **PAUSED**:

- `monitor-patch-recruitment-applications-hourly`: hourly.
- `daily-patch-recruitment-review-summary`: daily at 09:00 local time (Europe/Madrid).

The hourly checkpoint is intentionally absent until the first successful live read. Initial data will be a baseline, not falsely labelled new. Complete failures and partial scans do not replace the last successful checkpoint or report zero applications. The daily brief does not consume the hourly checkpoint. See `docs/recruitment-monitoring.md` for the full procedure.

## Git and release state

Website began clean on `codex/recruitment-live-release`, HEAD `9b9714d8b16772c47967c9bc30bf13da74ffffa3`. All changes for this task remain uncommitted. Patch OS had unrelated dirty front-end/release-note work when this task began; preserve it and exclude it from this release unless Patrick explicitly approves otherwise. Do not reset/stash/overwrite unrelated work or deploy the entire dirty workspace.

No commit, push, deployment, infrastructure change, production environment configuration, new OAuth consent or active monitoring occurred.

## Activation after approval

1. Review and release only the scoped Website and Patch OS changes through their existing services. Preserve unrelated dirty work and existing release safeguards.
2. Configure a dedicated server-only `RECRUITMENT_MONITOR_READ_TOKEN` in both services and `RECRUITMENT_MONITOR_BASE_URL` in Patch OS, set to https://www.patch.app. Do not reuse applicant/reviewer passwords or print the credential.
3. Obtain explicit new `recruitment:read` OAuth consent through the configured Patch Admin connection. No existing grant may be widened silently.
4. Discover the three tools and perform a real read-only baseline through Patch Admin MCP. Validate a complete scan before establishing the checkpoint. Retrieve an exact recording only when Patrick requests it; do not generate test applicants or emails.
5. Activate the two prepared tasks and verify their next runs. Local execution needs the Mac and app running.
6. Following the approved Patch OS push/commit/deployment, ask Patrick for the required authenticated 20-page Back Office refresh. Production verification remains incomplete until his result is recorded.

Removing the dedicated monitor token disables these read routes without changing applications or recordings. Do not roll back by deleting recruitment data.

## Planner decision request

Independent Planner decision: **ACCEPT the local implementation; HOLD commit, push, deployment, configuration, OAuth expansion and activation pending Patrick's explicit release authorisation.** Both the complete implementation and final audio transport addition were reviewed read-only. All requested local validation is complete; remaining checks require an approved release and real read-only MCP baseline.

Finished. Should we push, commit, and deploy? Please make that decision.
