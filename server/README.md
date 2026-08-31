# Website recruitment backend

This directory is a deliberately small, Website-only recruitment backend. It has no runtime, build-time, filesystem, database, network, or deployment dependency on any other Patch application.

## Hard safety gate

Patch OS is outside this backend's authority and must not be changed, executed, tested,
deployed, or connected to by recruitment work. The only permissible authority toward
Patch OS is an explicitly scoped, read-only reference inspection; this backend does not
perform or require one. It must never read from or write to a Patch OS filesystem,
database, API, service, deployment, or Railway resource. Recruitment state belongs only
to the Website-private data root described below.

## Runtime contract

The runtime targets Node 24 or newer and uses:

- `node:sqlite` `DatabaseSync` for the private recruitment database;
- Express for HTTP routing;
- Multer memory storage for one bounded multipart upload;
- Resend for the one outcome-email attempt.

`createRecruitmentRuntime(options)` in `server/app.js` is asynchronous and does not listen on a port or register process hooks. It returns:

```js
{
  app,       // configured Express application
  service,   // recruitment domain service
  database,  // recruitment SQLite adapter
  storage,   // private audio storage adapter
  close()    // idempotently closes only the recruitment SQLite handle
}
```

`createRecruitmentApp(options)` configures an Express app without opening storage or a database. `mountRecruitmentRoutes(app, options)` is available when a parent Website server owns the Express instance and dependencies.

No module calls `listen()`. The Website deployment entry point owns startup, shutdown, and static-directory selection.

## Environment

Required for a real runtime:

- `RECRUITMENT_DATA_ROOT`: private data root. Production is expected to use `/data/recruitment`; tests must use an OS-temporary directory. It must not be inside the Website repository.
- `RECRUITMENT_PERSISTENCE_ACK`: production-only deployment gate. Set it to `website-volume-mounted` only after `/data` is verified as a persistent volume attached to the Website service. Never point it at or reuse a Patch OS volume.
- `RECRUITMENT_COOKIE_SECRET`: at least 32 UTF-8 bytes, used to sign applicant and reviewer cookies.
- `RECRUITMENT_REVIEWER_SECRET`: exactly 12 characters.
- `RECRUITMENT_EMAIL_FROM`: verified Resend sender.
- `RESEND_API_KEY`: Resend API key.

Optional:

- `RECRUITMENT_EMAIL_REPLY_TO`
- `RECRUITMENT_BOOKING_URL` (defaults to `https://www.patch.app/coaching`)
- `RECRUITMENT_REVIEWER_SESSION_MINUTES` (bounded to 5–60; default 20)
- `RECRUITMENT_MAX_AUDIO_BYTES` (default 12 MiB)

The data root contains:

```text
recruitment.sqlite
audio/YYYY-MM/<server-generated UUID>.<approved extension>
.staging/
.trash/
```

Directories use private permissions and audio uses mode `0600`. Original client filenames are never used or stored.
At runtime startup, interrupted staging/quarantine operations are reconciled against SQLite: referenced files are restored, and unreferenced staging, quarantine, and audio files are removed.

## Applicant API

All responses are `private, no-store`.

### `GET /api/recruitment/status`

Returns whether the browser holds a valid applicant cookie and the public current-cohort state: `unavailable`, `not_open`, `open`, or `closed`.

`GET /api/recruitment/applicant/status` is an equivalent explicit alias.

### `POST /api/recruitment/unlock`

JSON:

```json
{ "password": "shared monthly cohort password" }
```

The active cohort must be inside its opening window. Passwords are stored only as scrypt hashes with per-cohort random salts. Success sets a signed, `HttpOnly`, `SameSite=Strict` applicant cookie whose expiry is the cohort `closesAt` instant. The password and cookie are reusable; duplicate applicant details and multiple submissions are deliberately permitted.

`POST /api/recruitment/applicant/unlock` is an equivalent alias.

### `POST /api/recruitment/applications`

`multipart/form-data` fields:

- `fullName`
- `email`
- `linkedin` (HTTPS LinkedIn URL; `linkedinUrl` is also accepted)
- `audioDurationMs` (sent by the Website client for contract compatibility; never trusted for enforcement)
- `audio` (one non-empty supported audio file)

Accepted base MIME types: WebM, MP4/M4A, AAC, MPEG/MP3, OGG, and WAV. The server parses the uploaded audio container, stores its measured duration, rejects unreadable media, and enforces the 60-second maximum independently of client metadata. The applicant cookie must still be valid and its `current` cohort must still be open. Audio is kept in a private cohort-month folder and promoted from a private staging path before the SQLite application record is inserted; a database failure removes the promoted file.

`POST /api/recruitment/applicant/applications` is an equivalent alias.

## Reviewer authentication

### `GET /assessment/:reviewerSecret`

The canonical private reviewer link contains the exact 12-character secret. The server
compares it in constant time, exchanges a valid value for the short-lived reviewer
cookie, and always responds `303 See Other` to `/assessment`. The exchange response is
`no-store` and sets `Referrer-Policy: no-referrer`, so the SPA URL no longer contains the
secret. An invalid link clears any reviewer cookie before the same redirect.

### `POST /api/recruitment/reviewer/session`

Requires:

```http
Authorization: Bearer <exact 12-character reviewer secret>
```

This bearer exchange remains as a non-URL alternative. Success sets the same short-lived signed, `HttpOnly`, `SameSite=Strict` reviewer cookie and responds with `303 See Other` to `/assessment`. Every other reviewer API route requires the reviewer cookie.

### `POST /api/recruitment/reviewer/logout`

Clears the reviewer cookie.

## Assessment API

### `GET /api/recruitment/reviewer/state`

Returns `authenticated`, `currentCohort`, `previousCohort`, the current cohort's
oldest-first `queue`, its first entry as `current`, and newest-first processed `history`
for the retained current and previous cohorts. Lists are bounded to 500 pending and
500 processed applications per retained cohort by default. A requested pending limit
is capped at 5,000; a requested processed limit is per cohort and capped at 2,500, so
both cohorts always retain a history window. `pendingTotal` and `processedTotal` remain
authoritative cohort-wide counts.

### `GET /api/recruitment/reviewer/applications?limit=100`

Returns pending applications oldest-first in both `applications` and `pendingApplications`, plus newest-first `processedApplications` history for the retained current and previous cohorts. The same bounded-list defaults and authoritative totals as `/state` apply. The response includes applicant details and audio metadata but never a filesystem path or storage key.

### `GET /api/recruitment/reviewer/applications/:applicationId/audio`

Streams only that application’s private audio. Supports one standard byte range, including suffix ranges, and returns `206`, `416`, or the complete `200` response with `Accept-Ranges: bytes`, `Content-Disposition: inline`, and `private, no-store`.

### `POST /api/recruitment/reviewer/applications/:applicationId/decision`

JSON:

```json
{ "decision": "pass" }
```

or:

```json
{ "decision": "fail" }
```

The first decision is immediate and irreversible. The same SQLite transaction sets `email_status=attempting`, records the attempt timestamp, and permanently raises `email_attempt_count` from 0 to 1. Exactly one `resend.emails.send()` call follows. Success or failure is recorded; there is no queue, cron, automatic retry, manual retry endpoint, or decision-change endpoint. A process interruption may leave `attempting`, which is intentionally never replayed.
If the sender or API key is not configured at all, the decision is rejected before SQLite changes; a configured provider call that later fails is still the single final attempt.

## Cohort controls

### `GET /api/recruitment/reviewer/cohorts`

Returns the `current`, `previous`, and `next` cohort summaries and application/pending counts. It also includes `cohorts` (the non-null summaries), `currentCohort`, and `previousCohort` for the reviewer UI.

### `POST /api/recruitment/reviewer/cohorts`

JSON:

```json
{
  "slug": "2026-09",
  "displayName": "September 2026",
  "password": "shared password",
  "opensAt": "2026-09-06T09:00",
  "closesAt": "2026-09-11T23:00"
}
```

Local timestamps without offsets are interpreted in `Europe/Madrid`, rejected if a DST time is missing or ambiguous, and stored as UTC ISO strings. An explicit RFC 3339 offset is also accepted. This endpoint creates and activates the cohort in one database transaction: the old `current` becomes `previous`, older retained data and any legacy `next` cohort are removed, and no draft remains if the operation fails. The new month must be later than the retained `current` or `previous` cohort. Activation is rejected while the current cohort still has applications waiting for a decision.

The full purged cohort-month audio folders are first moved into private quarantine, including orphan files that lack metadata. SQLite then removes applications and metadata in the same transition; quarantine is deleted only after commit and restored if the database transaction fails.

### `DELETE /api/recruitment/reviewer/cohorts/:cohortId`

Requires `{ "confirm": true }` and deletes only the exact active cohort. Its applications and complete private recording folder are removed, applicant sessions for it immediately become invalid, and applicant access closes. A retained `previous` cohort stays `previous`; it is never promoted automatically.

### Legacy prepared-cohort routes

`POST /api/recruitment/reviewer/cohorts/next` retains the earlier create-only behavior and
accepts `monthKey` in place of `slug`.

### `POST /api/recruitment/reviewer/cohorts/:cohortId/activate`

Requires `{ "confirm": true }` and only activates the prepared `next` cohort.
`POST /api/recruitment/reviewer/cohorts/activate-next` remains as an internal alias and
requires the same confirmation.

These legacy activation routes move `next` to `current`, move the old `current` to `previous`, and explicitly delete every older cohort. They remain available for compatibility but are not used by the reviewer UI.

## Health and static hooks

`GET /health` (for the deployment health check) and `GET /api/recruitment/health`
check SQLite, private storage, the production persistence acknowledgement, and outcome-email configuration without returning paths or secrets. A missing Website volume acknowledgement or email configuration keeps the service unready.

When `staticDirectory` is explicitly passed, the app serves the complete built Website:
root `index.html`, generated route directories, and assets are served directly, with the
root document as the client-side route fallback. Production deployment, volume creation,
environment configuration, email-domain configuration, and external-service changes
remain separate operations.
