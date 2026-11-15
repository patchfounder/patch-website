# Simplified Activation room — release handoff

## Reason

The previous Activation page required a separate host password, manual appointment entry and private room links. Patrick requested the simple shared-module experience instead and explicitly authorised committing, pushing and deploying it on 15 November 2026.

## Expected outcome

Patrick opens https://www.patch.app/training/activation/host and presses Go. A coach opens https://www.patch.app/training/activation and presses Enter when Patrick is connected. The room supports Patrick plus one coach. Additional coaches wait. Remove ejects the current coach; Finish closes the room. No password or manual room-creation form is shown.

## Scope & invariants

Allowed: the Activation training/host component and narrowly scoped styles, new shared-room state/API, integration mount, focused tests, environment-example comments and these training/release documents. Preserve the existing tutorial/PDF, full visible URLs, mobile-first design and existing booking destinations. Preserve legacy invitation records and APIs, unrelated Recruitment working-tree changes, other booking/recruitment pages, operational Coach data, emails, calendars, availability, native app code and deployed Patch OS. Reuse the existing Website LiveKit configuration and private volume; provision nothing.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation

The exact selected source was exported to `/private/tmp/activation-shared-release-bb6vypj9`, with the ten unrelated Recruitment changes excluded. Locked dependencies installed with scripts disabled. The full suite passed **201/201 tests**, zero failures/skips; production build passed and generated 17 metadata pages. Main JavaScript is 353.02 kB raw / 99.79 kB gzip; the unchanged lazy LiveKit SDK chunk is 607.88 kB raw / 161.30 kB gzip. `git diff --cached --check` passed.

Independent review found no release-blocking defect. Focused tests exercise real installed-SDK grants, concurrent admission, failed revocation/closure, stale Remove targeting, Leave/rejoin identity rotation, actual-presence handoff, camera-denial cleanup and late component responses.

Patrick authorised in-app-browser QA. A local synthetic LiveKit provider and browser SDK, stored outside the repository, verified Go → Enter → Remove (host remains connected) → Finish. No real camera, microphone, participant or provider room was used by this fixture. Exact 375/390/430-pixel frame layouts have no horizontal overflow, no forms/password inputs, and 44/48-pixel controls; desktop has a centred shared-width layout. Expand/collapse and preserved tutorial/PDF links were checked. Source screenshots and metrics are in `/private/tmp/activation-shared-qa`. Physical-device media remains a separate acceptance check.

## Deployed and verified

Runtime commit `bea3704d39247a683b2abdd978d3d050be84a2b7` was pushed and deployed as Website deployment `61b89c84-35f3-4188-b214-f5c19d3b8216` (**SUCCESS**), using the verified isolated source. No production variables or service settings changed.

At 11:37 UTC on 15 November, health, both training pages, the new room status and release provenance all returned 200. The room reported `ready:true`, `closed`, and `mayGo:true`. Provenance matched the exact feature commit. The served main bundle contains the shared-room API and excludes the old host form and all synthetic preview code. The PDF retains its original SHA-256 and byte count. Existing Activation booking and applicant pages remained available.

The live host page was then inspected in the approved browser: no forms/password inputs, Go enabled. The host page is https://www.patch.app/training/activation/host and the coach page is https://www.patch.app/training/activation. No real provider room was opened by verification. Patrick's physical Mac/iPhone camera and microphone trial remains pending.

The private receipt and screenshot are in `/Users/patrick/Desktop/Patch/Coaches/Training/records/activation-release/2026-11-15-shared-room.json` and its sibling evidence directory. The prior release receipt and historical invitation records remain unchanged.

## Integration limits

The shared room opens from Go. Cal.com is not connected to opening/countdown logic. Public host controls intentionally do not prove Patrick's personal identity. Browser-specific invisible owner authority prevents another tab visitor silently taking over an already open room. Server credentials remain private. A real physical-device video call remains separate from synthetic lifecycle verification.
