# Activation training room

## Current experience — 15 November 2026

Patrick explicitly requested one shared module room with no typed password or manual appointment setup. The public coach page is https://www.patch.app/training/activation and the host page is https://www.patch.app/training/activation/host. These are reusable module pages, not separate websites for every call.

Both pages preserve the approved seven-step tutorial and Patch Call Process PDF. Patrick presses **Go**, allows camera/microphone access, and waits in the room. A coach opens the public module page and presses **Enter** when Patrick is actually connected. The room admits Patrick plus one coach; other visitors see **Call in progress — please wait**. **Remove** ejects the current coach and frees their place without ending Patrick's connection. **Finish** closes the room. Leaving or five elapsed minutes alone does not complete training.

The host page deliberately has no personal identity check. The first Go opens the room and gives that browser its invisible owner cookie. Another browser cannot silently take over an already open room. Keep that host tab/browser for the call. Coach identity is not checked against James or a booking; Patrick handles an accidental wrong arrival using Remove, as explicitly requested. Server-only LiveKit credentials and automatic short-lived participant tokens remain invisible; there is no room password to copy or type.

## Timing and progression

This release is a host-opened room. Cal.com booking ingestion is **not connected**. Do not display an invented appointment countdown, claim that a booking opens the room, or claim that a room was added to a calendar. The five-minute elapsed indicator starts from Go and is a conversation guideline, not a timed cutoff. Room expiry is a separate safety limit.

Only an admitted coach whose call Patrick actually finishes can see the next-module booking link, https://www.patch.app/pre/. Visitors who merely open the module page and coaches removed from a call must not receive that handoff. This does not record module completion, account activation, certification or attendance in Patch Admin.

## Server configuration

The shared room uses the Website service's existing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `TRAINING_PUBLIC_ORIGIN` and private `TRAINING_DATA_DIR`. No new service, credentials or infrastructure are required. Secrets never belong in browser bundles, Git, public status or logs. Existing LiveKit Cloud is used for participant-token revocation.

`TRAINING_HOST_ACCESS_KEY` is **not required by the shared room**. Retain an existing value only for compatibility with the previous personal-invitation API and its historical records. The new pages do not show that sign-in or create personal invitations. Do not delete old records or silently invalidate existing invitations while changing the page.

The new router is mounted at `/api/training/activation-room` before the Website SPA fallback. Its interface is:

- `GET /status`: readiness, open/closed state, actual host/coach presence, availability and browser-specific controls. No coach email or credentials.
- `POST /go`: open the room or rejoin it from the owning host browser; return the host's short-lived LiveKit connection token.
- `POST /join`: atomically admit one coach or rejoin their existing place; return that coach's token.
- `POST /remove`: owner-only ejection and token revocation for the admitted coach; free their place only after confirmed removal.
- `POST /end`: owner-only confirmed closure, revoke room access and expose the next step only to the eligible admitted coach.
- `POST /leave`: release the current coach's place; a host leaving does not finish training.

The previous `/api/training` personal-invitation APIs remain for compatibility. The new shared-room state is separate from their records and from Recruitment.

## Verification and boundaries

Use isolated synthetic storage and an injected LiveKit provider for lifecycle, presence, concurrent admission, busy handling, Remove, stale-token blocking and Finish tests. Verify at mobile widths 375, 390 and 430 plus desktop. HD capture requests 1280×720 at 24 fps, with adaptive media delivery; actual resolution depends on the device and network.

This Website-only release changes no Patch OS code, native Academy screens, operational Coach records, Gmail, bookings, availability, calendar events or Coach/User ICS delivery. Do not mark a training stage complete from a timer, silence, a disconnect or a room visit. Physical Mac/iPhone camera and microphone testing must be distinguished from server/API and synthetic-provider verification.
