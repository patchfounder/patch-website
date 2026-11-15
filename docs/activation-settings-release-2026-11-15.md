# Activation settings and entry controls — release handoff

## Reason

Patrick requested Enter for both participants, Connecting… while joining, Leave only after connection, a red Leave button, white text on turquoise buttons and a minimal settings cog for optional microphone/camera selection and mute/video controls. He explicitly authorised committing, pushing and deploying this update.

## Expected outcome

Before entry, the room shows Enter and no Leave. While joining, it shows Connecting…. Once connected, the main view has a small timer and settings cog, red Leave and host-only Remove when appropriate. The compact settings panel is hidden by default and provides microphone/camera choice and mute/video toggles without permanent extra room controls.

## Scope & invariants

Allowed: the Activation frontend, narrowly scoped CSS, shared UI copy, meaningful frontend lifecycle tests and related training/release documents. Preserve tutorial/PDF, full visible URLs, actual host presence, two-person admission, Remove target/revocation, host closure and eligible-coach next-module handoff, HD capture and server-only credentials. Host Enter still calls the existing /go endpoint, coach Enter /join; host Leave /end, coach Leave /leave. Media-denial cleanup must not complete training. Contextual uncertain-closure retry remains possible without a normal Leave button before entry. No backend, dependencies, credentials, infrastructure, accounts, calendar, email or native app changes. Preserve all unrelated Recruitment/registration dirty paths. Patch OS must not be accessed or modified.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation and release

The exact eight-file selection was exported to `/private/tmp/activation-settings-release-orjel4n5`, based on `756050861c03ddaa56c09e982b6088d521dec6fa`, excluding all unrelated registration/recruitment changes (18 paths at review). Locked dependencies installed with scripts disabled. The complete suite passed **210/210**, zero failures/skips. Independent frontend and SDK reviews each passed **30/30** focused tests. Build passed with 17 route metadata pages; main JS is 354.75 kB / 100.32 kB gzip and CSS 137.76 kB / 25.37 kB gzip. The existing lazy LiveKit chunk is unchanged.

Installed SDK 2.24.1 source verified `Room.getLocalDevices(undefined, false)`, `getActiveDevice` and `switchActiveDevice`. Device enumeration is explicit and connected-only. Switching a muted input retains mute; false/rejected selections do not claim success. Captured track references and returned publications are stopped after late settings completion across Leave, unmount or unexpected disconnect, even when SDK publication maps have already been cleared. Media denial remains cleanup rather than training completion.

Patrick explicitly approved the local browser check. Synthetic devices/media verified Enter-only pre-entry and reloaded-open-room states, white entry text, red connected Leave, cog opening/closing/Escape focus return, both device selectors, mute/video-off preservation across selection, and host Leave closure. At 375/390/430 px the 180 px panel remains within the room with no horizontal overflow; controls are 44/48 px and Leave stays reachable. The cog is spaced clear of an hour-length timer. Evidence is in `/private/tmp/activation-settings-qa`; it contains simulated media and device names, not real camera captures. Existing live calls were not operated.

## Deployed and verified

Runtime commit `319bfdff2b4d70ff20b5007917a5f3122411d921` was pushed and deployed as Website deployment `25a2d53c-7b6e-45e0-88df-40bad67998ff` (**SUCCESS**). All 170 committed source files in the isolated export matched Git object hashes before packaging. Existing single-instance service settings and live room state were preserved; no production room was entered, removed or closed by verification.

At 12:46 UTC on 15 November, health, both training pages, room readiness and deployment provenance returned 200. Provenance matched the exact runtime commit. Served assets `index-DpXsZpwC.js` and `index-ChTwY2ky.css` contain the settings/device-selection code, corner timer, white entry text and red Leave, without obsolete always-visible controls or preview code. Room readiness was true. Existing Activation booking/applicant pages and the unchanged approved PDF remained available.

The private receipt and synthetic screenshots are stored at `/Users/patrick/Desktop/Patch/Coaches/Training/records/activation-release/2026-11-15-settings.json` and its sibling evidence directory. Physical hardware switching was not tested by this release. Previous receipts remain preserved.
