# Website Recruitment Guardrails

These instructions govern every task, agent, subagent, tool, script, command, and process used for recruitment work in `/Users/patrick/Desktop/Patch/Website`.

## EXPLICIT COACH REGISTRATION LIVE RELEASE EXCEPTION — 2026-10-16

Patrick replied "yes" to this exact request in this chat: "May I finish the Website-to-Patch OS connection, configure its server-only credentials, commit, push and deploy both services, and enable confirmation emails with VCF attachments to patrick@patch.app? Real submissions will then create Coach profiles and availability. I won't alter existing accounts or create live test accounts."

- This supersedes the earlier local-only/no-deployment restriction solely for this Coach registration feature and its dedicated server-to-server connection. Allow scoped Website implementation, the already implemented Patch OS registration/MCP capability, related verification, server-only integration credentials, commits/pushes, and the existing Website and Patch OS service releases.
- Production inspection/configuration is limited to identifying those two existing services, their deployment status and the dedicated registration credentials/URL plus existing email configuration. Do not inspect unrelated production data or modify existing accounts, schedules, calls, storage, domains, networking, or other services.
- No live test accounts or unsolicited test emails. Use synthetic isolated fixtures for all account/email verification. Real registration submissions may create accounts and send their VCF confirmation only to patrick@patch.app.
- Preserve the requested initial password 123456, Europe/London defaults, duplicate-contact allowance and VCF-only photo. Preserve all Coach/User ICS behavior and unrelated work. Secrets must never enter Git, browser bundles, logs or chat output.
- Report scoped local Patch OS changes and actual release state truthfully. Do not claim full release verification before Patrick's required authenticated Back Office refresh.
- Patrick separately approved including the existing unpushed Patch OS commit `9e9dcf51` ("Guard Support footer version against iOS build metadata") with this registration release. No other unrelated commits or changes are included by that approval.

## EXPLICIT LOCAL COACH REGISTRATION EXCEPTION — 2026-10-16

Patrick explicitly confirmed this override in this chat after the earlier automatic-approval rejection: "I override the Website-only and Patch OS read-only restrictions for local implementation and testing of Coach registration, account creation, availability, and related MCP tools. Do not deploy." His reply was "I confirm". This specific authorization overrides the conflicting rules below only for that local implementation and verification scope in `/Users/patrick/Desktop/Patch/Patch OS`.

- Allowed: inspect and edit the dedicated Coach registration endpoint/service, atomic Coach account creation and weekly availability persistence, related Patch Admin MCP tools and OAuth capability declarations, directly related tests, and their local Website integration contract.
- Use only synthetic test data in isolated temporary directories. Preserve the requested initial password and Europe/London defaults, allow distinct registrations with duplicate contact details, and exclude the contact-card photo from Patch profiles.
- Existing unrelated Patch OS code and all Coach/User ICS behavior remain protected. Do not use production APIs, operational data, infrastructure, credentials, account creation, email sending, migrations, or environment changes for verification.
- No commit, push, or deployment is authorized by this exception. Those actions require a separate release decision.
- Reports must accurately disclose scoped local Patch OS access/edits; all production resources remain outside this exception.

## HARD SAFETY GATE — PATCH OS IS OUT OF SCOPE AND PERMANENTLY READ-ONLY

This gate overrides convenience, inferred permission, implementation approval, and any less-restrictive instruction.

- The only repository that may be modified for this project is `/Users/patrick/Desktop/Patch/Website`.
- `/Users/patrick/Desktop/Patch/Patch OS` and everything connected to Patch OS are outside the implementation scope. The maximum authority held toward them is read-only, but recruitment implementation must not access them unless Patrick gives new, explicit permission for one precisely bounded read-only inspection.
- Never create, edit, patch, delete, move, rename, copy into, format, generate, install, build, test, lint, migrate, stage, commit, stash, switch, reset, push, deploy, or otherwise write anywhere in Patch OS.
- Never access or change the Patch OS Railway project, services, deployments, volumes, databases, stored data, environment variables, domains, networking, logs, settings, GitHub integration, or production state. Do not use Railway tooling or provider APIs against any Patch OS resource.
- Never start a Patch OS process or run any command that could emit caches, logs, dependencies, temporary files, screenshots, generated artefacts, or database writes in or through Patch OS.
- Before every write-capable operation, resolve its working directory, targets, output paths, caches, and temporary paths. They must all be outside Patch OS. Do not use broad paths, unresolved variables, globs, recursive operations, or symlinks that could include Patch OS.
- Website recruitment code must have no runtime, build-time, import, symlink, filesystem, database, network, deployment, or infrastructure dependency on Patch OS.
- Any approved visual or behavioural reference must be recreated independently inside the Website repository. Never copy private Patch OS code, data, or assets into Website.
- If an operation might affect or access Patch OS or anything connected to it, stop. Do not run it and do not attempt a workaround.
- Every phase update and final handoff must explicitly confirm that Patch OS was not accessed or modified.

## WEBSITE DEPLOYMENT BOUNDARY

- Recruitment must be built in this Website repository and use the existing Website/landing-page deployment path.
- Do not attach recruitment to a Patch OS service, volume, database, domain, environment, deployment, or Railway project.
- No production deployment, Railway change, DNS change, external-service configuration, database or volume provisioning, email sending, or live-data mutation may occur without Patrick's separate explicit approval.
- Architecture or implementation approval does not count as deployment approval.

## APPLICATION ROUTE — APPROVED RECRUITMENT REPLACEMENT

- On 2026-10-03, Patrick explicitly approved replacing the old WhatsApp-based `/application/` page with the existing recruitment experience from `/coach-application/`, removing the legacy `src/components/Application.jsx`, and committing, pushing, and deploying this migration through the Website service.
- `/application/` is now the canonical recruitment route. Patrick subsequently specified that `/coach-application/` must not redirect; retire the old route with a 404 response.
- This is a bounded exception to the former protection of the legacy page, not permission to access Patch OS, change unrelated Website pages, or alter recruitment storage, passwords, application windows, or assessment behaviour.
- Preserve recruitment-specific components, styles, metadata, tests, server modules, and storage. Update applicant links to the canonical route without changing the assessment back-office workflow.
- Verify the migrated password gate and application flow at the agreed mobile, tablet, and desktop sizes, and verify that the old URL returns 404 without redirecting.

## IMPLEMENTATION GUARDRAILS

- On 2026-10-03, Patrick separately approved implementing, committing, pushing, and deploying a Website-only `/administration` master-password login to the existing recruitment back office, including setting its server-only password hash on the Website service. This does not authorize changes to applicant passwords, application windows, recordings, email configuration, or Patch OS. Never commit the real master password or its hash; retain the existing secret-link access unless separately instructed otherwise.
- Patrick subsequently corrected the master-password entry point to the existing password field at `/application` and explicitly approved committing, pushing, and deploying that correction. The master password opens the back office independently of the application window; applicant passwords remain subject to the existing window rules. Keep the existing `/administration` and private-link access functional unless separately instructed otherwise.

- Applicant and reviewer surfaces are mobile-first. Begin visual implementation and verification at 375x812, 390x844, and 430x932 before tablet or desktop.
- Reuse Website design tokens and proven Website patterns. Scope all new recruitment CSS to recruitment routes; do not change existing `.application-*` or broad global selectors.
- Uploaded audio must never be stored in Git, source directories, `public/`, repository-local temporary folders, or Patch OS. It must use the approved private Website recruitment storage path with authenticated playback.
- Preserve all existing user work and untracked files. Do not reset, clean, stash, overwrite, delete, or reformat unrelated work. Inspect exact targets and Git state before each mutation.
- Use the approved recruitment architecture and keep it deliberately small. Do not add identity providers, queues, retry systems, external databases, object stores, or staging infrastructure unless Patrick explicitly changes the scope.

## STOP CONDITION

If a target is ambiguous, an instruction conflicts with this file, an operation may affect Patch OS or change `/application/` beyond Patrick's approved recruitment scope, or a required action would leave the Website deployment boundary, stop and ask Patrick before proceeding.
