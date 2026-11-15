# Activation training: local implementation and release review

## Reason

Patrick requested a web-first Academy Activation experience: prerecorded preparation video, call-script PDF and a private one-to-one video check-in hosted from his iPhone. Future modules follow the same preparation/review/handoff pattern before eventual Coach Academy integration.

## Expected outcome

Coaches prepare on https://www.patch.app/training/activation and join a server-verified five-minute private appointment. Patrick signs in at https://www.patch.app/training/activation/host, opens the same scheduled room and explicitly finishes it to reveal the Module 1 booking link. A temporary disconnect, five elapsed minutes or a visitor-supplied role cannot unlock Module 1 or record a training completion.

## Scope & invariants

Website implementation only. New files: ActivationTraining.jsx/CSS, ActivationHost.jsx/CSS, training-room-state.js, server/training-meetings.js, three focused test files, operating documentation and local preview proof. Existing targeted changes: package.json/package-lock.json (pinned LiveKit client 2.24.1 and server SDK 2.19.3), .env.example (empty server configuration), server.js (separate router before the SPA fallback), src/main.jsx (two routes), and route metadata script.

Allowed UI: the new Activation Academy page, preparation sections, private video panel and its controls, and new private host console. Do not change existing Training/Activation booking pages, recruitment/applicant/reviewer interfaces, Coach/User fronts, surrounding existing navigation, calendar events, booking durations or app layouts. No native app build.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

Patch OS was inspected read-only for existing LiveKit patterns; no Patch OS code or configuration was modified and no operational records, production secrets or runtime settings were read for this build. No emails, real appointments, calendar invitations or provider calls were created. No production configuration, commit, push or deployment occurred.

## Verification

- Final full Website suite: **191/191 pass**, zero failures/skips (`/private/tmp/patch-activation-final-tests.log`). Synthetic private temporary storage and fake provider; the installed SDK's actual offline JWT camera/microphone grants were verified.
- Production build: pass, 17 metadata pages. LiveKit client is lazy loaded in its own chunk; Vite reports that optional chunk at 607.88 kB before gzip (161.30 kB gzipped).
- `git diff --check`: pass.
- Browser checks authorised by Patrick: mobile CSS widths 375, 390 and 430, no horizontal overflow; preparation video rendered; private synthetic appointment countdown/local time; host sign-in and invitation role; expansion, Escape/focus restoration. No real camera/microphone session or LiveKit connection tested.
- Evidence: `docs/previews/activation-training-2026-11-15/activation-mobile-full.png`, `activation-expanded-mobile.png`, `host-mobile.png`. These contain a synthetic preview appointment only.
- Independent backend review resolved invalid-ID lock leakage, unsafe finish/re-entry and key-rotation concerns. Strict Finish requires LiveKit Cloud and revokes both participant identities before room deletion; uncertain closure remains `ending` and keeps Module 1 unavailable.
- Dependency audit returned 10 advisories in existing dependencies (including proxy-addr critical). None names the new LiveKit packages; all affected package versions are identical to pre-change HEAD. No unrelated dependency fixes were bundled.

## Remaining live-use requirements

1. Patrick's separate Website release/configuration approval.
2. Verify the existing LiveKit project uses an official LiveKit Cloud URL, then configure its existing server credentials on Website without exposing them to Git, logs or browser bundles.
3. Set dedicated host access and a private directory on the existing Website persistent volume. No new infrastructure is provisioned by this local build.
4. Cal.com is not linked to room provisioning. The initial host console creates a private room from an already agreed appointment and lets Patrick share its coach invitation. It does not create/change calendar bookings or send email. Automatic booking ingestion needs a separately implemented and verified bridge.
5. The current Cal.com Activation booking remains 30 minutes. The page truthfully shows that fact. Do not display a five-minute booking until the actual event duration is changed and verified.
6. Verify a real two-phone call after authorised deployment, including permissions, mobile reconnection, host Finish, token revocation and next-stage handoff.

## Working tree and release boundary

Current Website branch: `codex/recruitment-live-release`; reused without switching or cleaning. Pre-existing dirty work must be excluded from this feature release: AGENTS.md, server/README.md, server/app.js, server/recruitment-db.js, server/recruitment-email.js, recruitment ongoing/team-decision tests, docs/recruitment-review-workflow.md, server/recruitment-chat-review.js and its test. Do not include, reset, stash or overwrite those files. Existing Patch OS dirty work is unrelated and remains outside release scope.

The Website AGENTS.md explicitly says: “Architecture or implementation approval does not count as deployment approval.” The Sites default publication flow does not override that project boundary.

Finished. Should we push, commit, and deploy? Please make that decision.

## Planner decision

Independent Planner review on 15 November: **ACCEPT the tested local prototype; HOLD commit, push, deployment and production configuration.** No additional material code blocker was found within the documented manual-room-provisioning scope. Release requires Patrick's separate approval, verified LiveKit Cloud/configuration/private storage, an explicit decision on initial manual versus automatic Cal.com provisioning, reconciliation of the five-minute booking setup and a real mobile-call check. Select only training feature files and exclude all existing Recruitment work. The 191-test suite passed in the combined working tree; validate the exact release selection before pushing.

## Release authority received

Patrick subsequently instructed: “Yes, commit, push and deploy the Activation page and connect it to our existing LiveKit so I can try hosting a call from my iPhone.” This authorises this exact Website release and configuration, including read-only retrieval of the three existing LiveKit connection values for server-only reuse on Website, dedicated private host access and training storage on the existing Website volume. It does not authorise modifying the Patch OS service, reading unrelated operational data, changing Cal.com durations/buffers, sending invitations, deploying Recruitment work or starting an automation.

Independent release review now **APPROVES the scoped commit/push/deploy**, conditional on testing the exact selected source tree and verifying the existing runtime/configuration. The earlier HOLD above remains historical. Initial room provisioning is the manual version explicitly described before Patrick approved release.

## Production receipt

The authorised feature was committed and pushed as `40f6d9a1c1d1758dbc128ccf32a541b358415e17`, tree `3bf8adf5b80a0b7b8192cad4935c6e706b861d39`. The exact 20-file selected release was exported separately from the dirty workspace; **181/181 exact-tree tests** and the production build passed. The larger 191-test result above includes unrelated, excluded Recruitment work.

Website deployment `61aa5671-c9fa-4e28-bd1f-41618882fb1d` completed **SUCCESS** on the existing `patch-website` service, with its existing `/data` volume. The existing LiveKit Cloud connection was copied server-side using private stdin; only its three named connection values were retained from the read-only source. Website received dedicated private host access, exact Website origin and `/data/training-activation`. No Patch OS configuration or application state was modified.

At 10:59 UTC on 15 November, https://www.patch.app/health, https://www.patch.app/training/activation, https://www.patch.app/training/activation/host and https://www.patch.app/api/training/config all returned 200. Training reported `ready:true`. The public deployment provenance at https://www.patch.app/training/activation/release.json matched the exact feature commit. The approved PDF matched its original SHA-256 and byte count. Existing Activation booking and applicant pages remained available.

A uniquely named empty LiveKit verification room was created, read back with a two-participant limit, both test identities were explicitly revoked, and the room was deleted. No existing rooms were read or modified, and no media was captured. Public-build scanning found none of the configured LiveKit secrets or host key. Live anonymous host access was denied; protected host login, secure scoped HttpOnly cookie, private agenda and test-session logout were verified. No actual Coach appointments or invitations were created by verification.

The private deployment receipt is `/Users/patrick/Desktop/Patch/Coaches/Training/records/activation-release/2026-11-15.json`; private host access is kept separately outside Git. A real two-phone camera/microphone call remains Patrick's next check. Cal.com room creation remains manual, the live booking duration remains 30 minutes, and no calendar or buffer configuration was changed.
