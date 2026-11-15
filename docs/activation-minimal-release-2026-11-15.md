# Minimal Activation controls — release handoff

## Reason

Patrick requested absolute minimalism: remove the mic/camera toggles, flip camera, manual refresh and separate Leave/Finish controls, make the elapsed timer small and quiet, and align the page with the canonical Patch palette. He explicitly authorised commit, push and deployment.

## Expected outcome

The host sees Go, then one Leave and Remove when a coach is present. The coach sees Enter, then one Leave. Camera and microphone start on entry; the timer is a plain value in the video corner. The page uses the approved Patch accent and navy from `/Users/patrick/Desktop/Patch/Brand/Docs/Patch_Brand_Strategy.md` section 06. No manual refresh or extra media controls compete with the call.

## Scope & invariants

Only the Activation component/scoped stylesheet, shared UI copy, related frontend regression tests and training/release documentation may change. Preserve tutorial/PDF, actual presence, two-person capacity, Remove target/revocation, room closure and eligible-coach next-module handoff, full visible URLs, inherited layout, mobile spacing and HD capture. Host Leave calls the existing `/end` endpoint; coach Leave and camera-failure cleanup retain `/leave`. No backend, dependencies, credentials, infrastructure, calendar, email, account or native app changes. Preserve unrelated Recruitment edits. Patch OS must not be accessed or modified.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation and release

The exact eight-file selection was exported to `/private/tmp/activation-minimal-release-npe_fhpk`, excluding all ten unrelated Recruitment paths. The full suite passed **204/204**, zero failures/skips, and the production build passed with 17 route metadata pages. Independent focused review passed **24/24** frontend tests, including host closure, coach departure, camera-denial cleanup, failure retry and reload recovery. Staged whitespace checks passed.

Patrick authorised a local browser check. Synthetic media verified Go/Enter, host Remove without closing the host connection, one host Leave closing the room, and the eligible coach's next-module handoff. At 375/390/430 px there is no horizontal overflow; the connected host has one 48 px Leave button, and the 28 px timer is clear of the self-view. Host plus coach shows only Remove/Leave; the coach shows only Leave. Computed colours match navy RGB(8,55,93) and primary accent RGB(0,165,192), with black button text. The isolated component screenshot is `/private/tmp/activation-minimal-qa/room-preview.jpg`; its black self-view is simulated media, not a real camera capture.

Production build: main JavaScript 349.23 kB / 98.73 kB gzip, CSS 135.78 kB / 25.04 kB gzip. The unchanged lazy LiveKit chunk remains 607.88 kB / 161.30 kB gzip. No real LiveKit room or current production call was operated during QA. Deployment verification follows.

## Deployed and verified

Runtime commit `7d68514391e6fa24930e343bbb9fc29982555ab2` was pushed and deployed as Website deployment `d47f89cd-8547-40b0-9e3d-774eda264116` (**SUCCESS**). All 169 committed source files in the isolated export matched Git object hashes before packaging. No configuration or live room operations were performed.

At 11:56 UTC on 15 November, health, both training pages, room status and release provenance returned 200. Provenance matched the runtime commit; room readiness was true. Served assets `index-BE57as4b.js` and `index-OkimygK6.css` contain the minimal UI/corner timer and canonical navy/cyan, with no removed-control labels, refresh/expand styles or synthetic preview code. Existing Activation booking and applicant pages remained available. The PDF's byte count and SHA-256 are unchanged.

The existing live room was left untouched. Physical camera/microphone testing was not performed by this release. The private receipt and preview evidence are stored at `/Users/patrick/Desktop/Patch/Coaches/Training/records/activation-release/2026-11-15-minimal-controls.json` and its sibling evidence directory. Earlier release receipts remain preserved.
