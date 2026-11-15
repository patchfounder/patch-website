# Activation translucent turquoise cleanup — release handoff

## Reason

Patrick tested a real Mac/iPhone call and requested a minimal off-brand-colour cleanup: remove navy, the visible Remove control and redundant joining/unavailability text. He explicitly authorised commit, push and deployment.

## Expected outcome

A pale translucent turquoise room replaces navy. The small timer and cog remain legible over live video using light frosted turquoise surfaces. Red Leave sits on a translucent turquoise footer. Settings open into a compact light popup with black text and four equal-sized controls: Microphone, Camera, Mute and Video off. Solid turquoise actions retain white text.

## Scope & invariants

Allowed: Activation frontend, scoped CSS/shared UI copy, focused lifecycle/state tests and training/release documents only. Do not touch other page elements, tutorial/PDF content or full visible URLs. Preserve explicit Enter, connected-only Leave/settings, HD capture, actual presence, two-person admission, async media cleanup, device state, accessible focus/dismissal, confirmed host closure and eligible-coach next-stage handoff. Remove only the visible Remove control; retain the backend endpoint and removed-state handling. Passive 503 polling is quiet; an explicit failed Enter remains retryable with concise feedback. No backend, dependency, credentials, infrastructure, accounts, calendar, email or native app change. Preserve the 18 unrelated registration/recruitment paths. Patch OS was not accessed or modified.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation

The exact seven-file selection was exported to `/private/tmp/activation-turquoise-release-4c30u8s0` from parent `573b956063be4d6b89aa45068a5243baccf34734`, excluding all 18 unrelated registration/recruitment paths. Existing locked dependencies were installed with scripts disabled. Full tests passed **213/213**, zero failures/skips. The production build passed: 77 modules, 17 route metadata pages, main JS 354.05 kB / 100.16 kB gzip, CSS 138.44 kB / 25.66 kB gzip. The pre-existing lazy LiveKit chunk is unchanged.

Independent review passed 33/33 focused tests and found no media lifecycle/closure regressions. Patrick approved the local browser check. Synthetic media/device verification covered Enter, settings open, microphone/camera changes, preserved mute/video-off state, Escape focus return and host Leave. At 375/390/430 px, no horizontal overflow; the compact popup is 154px tall, remains within the video area, and all four controls measure exactly 44px high with matching column widths. The desktop controls also measure 44px high. Timer/cog use a light frosted backing for black-text contrast over dark video. Screenshots and metrics are in `/private/tmp/activation-turquoise-qa`; they contain simulated media/devices. No live call was operated. Patrick separately reported a successful real Mac/iPhone call before this styling change.

Awaiting independent Planner release decision and production read-only verification. Patch OS was not accessed or modified.
