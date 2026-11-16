# Six training stage pages — release handoff

## Reason

Patrick approved six meaningful six-letter routes and requested all six pages built from the Activation template, with placeholder videos, committed, pushed and deployed.

## Expected outcome

Activation, Pre-Masterclass, LinkedIn Masterclass, LinkedIn Activity, Know Your Coach and Certification each have their own mobile page and host URL. The approved visual design and minimal room controls are shared, while room state and module content remain separate.

## Scope & invariants

Allowed: public six-stage content/route map, shared Activation frontend and narrow CSS, room factory stage scoping, route mounts, route metadata, focused tests and related Website documents. Preserve the existing tutorial/PDF, old Activation URLs/room records/cookies, explicit Enter and connected-only settings/Leave, HD capture, asynchronous media cleanup, two-participant admission, revocation, same-origin checks, confirmed host closure and eligible-coach handoff. Do not touch unrelated page layouts, Registration/Recruitment work, credentials, infrastructure configuration, operational Coach data, calendars, email, native app or protected ICS behaviour. Module placeholders are labelled; do not pretend module-specific videos/resources are finished. Certification is not automatically recorded or awarded. Patch OS was not accessed or modified.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation and release

The exact 17-file selection was exported to `/private/tmp/training-stages-release-e67epbdy` from parent `24449bdeba0a5d645cd453375e6b9f38bb6a5066`, excluding all 18 unrelated registration/recruitment paths. Existing locked dependencies installed with scripts disabled. The full suite passed **228/228**, zero failures/skips. Production build passed: 78 modules and 29 metadata pages (the original 17 plus six coach/six host pages); main JS 357.52 kB / 101.31 kB gzip, CSS 138.44 kB / 25.66 kB gzip. The pre-existing lazy LiveKit chunk remains unchanged.

Focused checks passed: 45 frontend/routing tests and 20 existing/new backend room tests. Independent code review found no blockers. All six stages have separate namespaces, cookie scopes and saved files; tests cover cross-stage session/owner/coach-cookie misuse, restart compatibility, room admission/closure and exact handoffs. Activation's old stored schema, filename, cookie scope and room prefix remain compatible.

Patrick approved local browser QA. All six pages were rendered and visually inspected at 375px; every stage was measured at 375/390/430px without horizontal overflow, with content contained inside the shared mobile edges. All six host pages were checked on desktop, with 800px maximum shells and Enter only before joining. A synthetic two-browser Pre-Masterclass call verified host/coach Enter, matching44px settings controls, device selection/mute, host Leave and the admitted coach's exact LinkedIn Masterclass handoff. The reused video player loaded successfully; the five module pages clearly label it as a placeholder. Evidence is in `/private/tmp/training-stages-qa`, with synthetic media only. No production call was operated. Patch OS was not accessed or modified.

Awaiting independent Planner release decision and production read-only verification.
