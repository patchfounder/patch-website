# Website Recruitment Guardrails

These instructions govern every task, agent, subagent, tool, script, command, and process used for recruitment work in `/Users/patrick/Desktop/Patch/Website`.

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

## PROTECTED APPLICATION PAGE

- `/application/` is production-protected.
- `src/components/Application.jsx` may be changed only for the separately approved, targeted restoration of the known accidental recruitment prototype to its clean committed version.
- Recruitment must use separate routes, components, styles, metadata, tests, server modules, and storage. Do not extract a shared editable base or change shared code in a way that risks altering `/application/`.
- Verify the protected page before and after recruitment work at the agreed mobile, tablet, and desktop sizes.

## IMPLEMENTATION GUARDRAILS

- Applicant and reviewer surfaces are mobile-first. Begin visual implementation and verification at 375x812, 390x844, and 430x932 before tablet or desktop.
- Reuse Website design tokens and proven Website patterns. Scope all new recruitment CSS to recruitment routes; do not change existing `.application-*` or broad global selectors.
- Uploaded audio must never be stored in Git, source directories, `public/`, repository-local temporary folders, or Patch OS. It must use the approved private Website recruitment storage path with authenticated playback.
- Preserve all existing user work and untracked files. Do not reset, clean, stash, overwrite, delete, or reformat unrelated work. Inspect exact targets and Git state before each mutation.
- Use the approved recruitment architecture and keep it deliberately small. Do not add identity providers, queues, retry systems, external databases, object stores, or staging infrastructure unless Patrick explicitly changes the scope.

## STOP CONDITION

If a target is ambiguous, an instruction conflicts with this file, an operation may affect Patch OS or `/application/`, or a required action would leave the Website deployment boundary, stop and ask Patrick before proceeding.
