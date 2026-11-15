# Activation training room

This Website-only implementation adds a separate one-to-one training meeting flow. It does not change Patch OS calls, Recruitment, existing booking pages, emails, calendar events, credentials or Coach/User ICS delivery. The shared preparation video and script remain public. A scheduled live room requires its own personal invitation.

## Web-first Academy

Patrick confirmed on 15 November that training will first be delivered as web pages, then incorporated into the Patch Coach Academy. Keep public lesson content, server-owned meeting state and the mobile presentation separate. The later app can reuse the approved materials and meeting service; this Website build does not add native Academy screens or change the existing Patch Call experience.

## Hosting from an iPhone

Patrick signs in to the training host console with its dedicated host access key. He enters the coach's name, full email and verified appointment start, after checking that the exact coach is saved in Contacts. The room record is five minutes long. The console produces separate host and coach links, which must be shared through an explicitly authorised invitation. It does not email anyone or create a Cal.com/calendar booking.

Both participants open their own invitation on the Activation training page. At the booked start, each explicitly taps Join and allows camera/microphone access. The private room has a maximum of two participants. No outgoing telephone call is made. Leaving, browser interruption or five elapsed minutes does not complete a training stage. Patrick uses Finish to close the room. Only a confirmed successful room closure makes the Module 1 booking link available; no module completion, account activation or certificate is inferred or written.

## Configuration

The server router accepts an explicit environment object; no credentials belong in source, static files, browser bundles or logs. Configure through the existing approved server configuration/release process:

| Variable | Requirement |
| --- | --- |
| `LIVEKIT_URL` | Existing LiveKit Cloud server URL (`*.livekit.cloud` or `*.livekit.run`); production requires `wss://` or `https://`. Cloud participant-token revocation is required for strict Finish; self-hosted service is unavailable in this initial implementation. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Existing server credentials. They never enter public config or room status. |
| `TRAINING_HOST_ACCESS_KEY` | Dedicated secret of at least 24 characters, with no production default. It authenticates Patrick and signs domain-separated invitation links. It is separate from Recruitment authority. |
| `TRAINING_PUBLIC_ORIGIN` | Exact permitted page origin; defaults to https://www.patch.app. Production requires HTTPS. It is never inferred from a request Host header. |
| `TRAINING_DATA_DIR` | Production requires an explicit absolute, dedicated private directory outside the Website checkout, mode 0700. Session files are 0600, written atomically with revision checks. Development can use its dedicated OS temporary directory. |
| `TRAINING_ACTIVATION_BOOKING_URL` | Defaults to https://cal.com/patchapp/activation. Must be HTTPS. |
| `TRAINING_ACTIVATION_BOOKING_MINUTES` | The existing booking duration defaults to 30. A new value is displayed only with `TRAINING_ACTIVATION_BOOKING_DURATION_VERIFIED=true`, after the actual booking configuration has been verified. A five-minute private room does not change the live Cal.com event. |

Missing or unsafe configuration leaves the rest of Website running. The training config/protected APIs return 503 and do not start a LiveKit connection. Private storage is initialised only on an actual request after the configuration validates. Existing shared/world-accessible directories are rejected rather than chmodded.

Host cookies are dedicated to `/api/training`, HttpOnly, SameSite Strict, Secure in production, and expire after eight hours. Server restarts require host sign-in again. POST requests require the exact configured Origin. Login uses constant-time comparisons and bounded attempt limits, ignoring forwarded address claims.

Per-session role secrets are HMAC-derived using separate host/coach labels and a random session nonce; only their hashes and nonce are stored. Authenticated host listing reconstructs the same links after refresh/restart. The secrets are carried in URL fragments, then the frontend strips them and keeps the current tab's access in session storage. They are not query-string parameters or referrer data. Rotating the host access key revokes earlier role links; authenticated hosts retrieve newly signed links. Invitation access expires seven days after the appointment. Joining is limited to the booked start through ten minutes after the five-minute appointment ends; this grace supports rejoining, not automatic stage completion or a hard video cutoff.

## API contract

Mount `createTrainingMeetingsRouter({env, projectRoot})` at `/api/training`. The optional `livekitFactory` and `now` arguments support isolated synthetic verification.

- `GET /config`: safe readiness, booking URL, truthful booking duration, `sessionDurationSeconds:300`, `webhookConnected:false`.
- `POST /host/login`: `{accessKey}`; creates the dedicated host cookie. `POST /host/logout` revokes it.
- `GET /host/sessions`: `{sessions:[...]}` with safe appointment details, coach email, booking reference and separate role links; host authentication required.
- `POST /host/sessions`: `{coachName,coachEmail,startAt,contactsVerified:true,bookingReference?}`. The time requires an explicit UTC offset or Z. Creates a 300-second private appointment and returns `{session,hostUrl,coachUrl}`. The Contacts field records a **host attestation**, never a claimed MCP verification. A repeat of identical normalised coach email/start or booking reference returns the original session/links with `reused:true`; conflicting reuse returns 409. A global create lock prevents concurrent duplicate rooms.
- `GET /sessions/:id/status`: direct safe status object. Use `Authorization: Bearer <personal fragment secret>` or the authenticated host cookie.
- `POST /sessions/:id/join`: same authority; returns `{serverUrl,participantToken,role,session}`. The LiveKit token permits camera/microphone publishing, subscription, and only this room, with no room administration/data publishing. Stable role identities support rejoining without adding another participant.
- `POST /sessions/:id/end`: host only. Persists `ending` before provider closure, blocks new token issuance, explicitly revokes **both** stable participant identities through LiveKit Cloud with a cutoff beyond the current second, then deletes the room. It persists `ended` only after both revocations and deletion succeed. Uncertain closure remains `ending`, with host Finish retry available and Module 1 unavailable. A missing-participant revocation error is not silently accepted. Ending is idempotent once confirmed.

The direct status object includes `sessionId`, `stage`, `status`, `serverTime`, `startAt`, `endAt`, `joinOpensAt`, `joinClosesAt`, `role`, `coachName`, `hostName`, `mayJoin`, `mayEnd`, `expired`, `nextStageAvailable` and `nextStageUrl`. Statuses are `scheduled`, `ending`, `ended`, and reserved `cancelled`. `nextStageAvailable` is true only for `ended`; its URL is https://www.patch.app/pre/.

The strict closure rule follows LiveKit's documented Cloud revocation behavior: https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/ and https://docs.livekit.io/frontends/reference/tokens-grants/. Deleting a room alone does not invalidate cached participant tokens; self-hosted deployments do not provide the same revocation guarantee. Role-link hashes in the record preserve the originally issued invitation evidence; current key-derived, session/nonce/role-bound HMAC values are the live authority, so key rotation does not make historical records unreadable to a newly authenticated host.

Errors return `{ok:false,code,message}` without provider errors, raw credentials or private records. Public status omits the coach email and invitation secrets. Per-session mutation locks plus atomic revisioned writes protect concurrent join/finish. A process crash while holding a lock fails closed; an operator must confirm the process is stopped before removing that session's stale `.lock` file. Never automatically reopen an uncertain ending session.

## Current integration boundary

Cal.com webhook ingestion and booking reconciliation are **not connected**. The existing booking button remains available, but its browser success event is not trusted room authority. A verified booking must currently be entered by Patrick into the host console and the resulting personal coach link shared manually. The service does not send email, create a calendar invitation, inspect operational Coach records, or change Cal.com durations. Automatic provisioning/cancellation/rescheduling requires a separately implemented signed-webhook/server API bridge and explicit verification.

No production configuration, real appointment, connection test, browser permission, native-app camera permission, release or deployment is implied by the local build. Verify a real two-phone Safari/Android call, permission denial/recovery, rotation, mobile-network reconnection, Finish and the Module 1 handoff before relying on it for live training. The future Coach Academy can consume the same session API after its own authenticated integration is designed.
