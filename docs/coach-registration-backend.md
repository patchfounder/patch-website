# Coach registration backend contract

Local implementation approved on 16 October 2026. This document describes the dedicated Patch backend connection; it does not authorize release or production account creation. The registration page in `mockups/coach-registration` remains a browser-only design preview.

**Current status — live release approved:** Patrick subsequently approved finishing the server-to-server connection, configuring its dedicated credentials, committing/pushing/deploying both existing services, and enabling VCF confirmation email to `patrick@patch.app`. The earlier local-only handoff below is historical and superseded only for this bounded registration release. The production page is now implemented in `public/coach-registration/`; the original mockup remains a separate design artifact.

## Website registration flow

- Public route: `/coach-registration/`, excluded from indexing and main navigation.
- `GET /api/coach-registration/status` returns only readiness and a safe message.
- `POST /api/coach-registration` accepts bounded multipart details/availability and an optional JPEG/PNG contact-card photo. The browser prepares the photo up to 1024 pixels and 1 MiB. The server forwards **only account fields and availability** to the dedicated Patch registration endpoint.
- The existing Website Resend configuration sends one confirmation with an Apple-compatible vCard 3.0 attachment to **patrick@patch.app only**. No confirmation email is sent to the Coach. No Patrick signature is impersonated.
- The photo is held only in request/browser memory and embedded in the VCF. It is not saved to disk, receipt storage, Git or the Coach profile.
- The existing private Website volume holds a separate `coach-registration.sqlite` with request hashes, account/provider IDs and timestamps only. It contains no raw contact details or photo. These receipts are independent of recruitment application-window removal.
- Identical submissions retain one request ID and reuse backend/provider idempotency. Explicitly separate registrations may reuse contact details. An uncertain response never invites the Coach to start another registration. A confirmed account with pending email stays clearly pending until delivery is accepted; retries outside the provider's safe window require contacting Patch rather than risking another email.
- Same-origin checks, bounded upload parsing and narrowly Railway-aware client rate limits do not change existing recruitment/global proxy behavior.

### Release verification and decision

- Website complete test suite: **72 passed**; production build passed.
- Patch registration/MCP and protected Coach/User ICS suites: **109 passed**.
- Existing approved footer-check and production preflight unit tests: **11 passed**; Support version checker passed (`V.1.0 (18)`).
- Actual Website runtime → real disposable Patch server → saved profile/availability and login → mocked VCF email passed, including uncertain-email recovery, identical retry and duplicate-contact/new-request behavior.
- Browser form, review and real server-confirmed completion passed against those synthetic services. Mobile widths 375, 390 and 430, tablet 768 and desktop 1440 were checked without horizontal overflow. Photo selection/preparation passed; no browser warnings/errors were captured.
- Independent final review cleared account/photo privacy, VCF formatting, scoped authorization, retry behavior and rate/validation recovery.
- Dedicated registration credentials were configured through hidden stdin on the two exact approved existing services with automatic redeploy skipped. Existing email settings were retained; no credentials were written to source, browser code, disk artifacts or output.
- Patrick explicitly approved including the existing local Patch OS footer-check commit `9e9dcf51`; no other unrelated changes are included.

Planner release decision: **approved** for this exact tested change set and the separately approved footer-check commit. Patch OS must use the existing GitHub `main` integration after a clean production preflight; Website must use its existing recruitment branch and exact Website Railway service. No live test accounts or emails are authorized. Post-deployment status and the public page/readiness must be checked without submitting a live registration. Patrick's authenticated 20-page Back Office refresh remains a required user-performed post-release check; never claim it passed before his report.

## Account creation

The Website's eventual submit handler calls `POST /api/integrations/coach-registration` on the Patch backend from the Website server. It must never call this integration directly from a coach's browser, expose the integration secret, import Patch OS source, or access the Patch database/filesystem.

The backend reads `PATCH_COACH_REGISTRATION_SECRET`. An unset/invalid secret disables the endpoint. A configured secret of at least 32 bytes is sent as a Bearer token over HTTPS by the Website server. Provisioning or changing secrets and deployment remain separate release actions.

The JSON body is bounded to 16 KiB:

```json
{
  "requestId": "a-new-uuid-for-this-registration",
  "firstName": "Alex",
  "surname": "Morgan",
  "email": "alex.morgan@example.test",
  "phone": "+44 7700 900123",
  "linkedin": "https://www.linkedin.com/in/alex-morgan-example",
  "availability": [
    { "day": "Monday", "slots": [
      { "start": "09:00", "end": "12:00" },
      { "start": "14:00", "end": "17:00" }
    ] }
  ]
}
```

The requested account password and `Europe/London` defaults are set inside the Patch backend, not supplied by the browser. Unspecified weekdays/slots are empty. Availability uses the existing Patch format: Monday–Friday, up to three ranges per day, 06:00–22:00, 15-minute increments, and a minimum 15-minute gap between ranges.

The contact-card photo is deliberately absent from this request. The Website will use it only to generate the emailed VCF, without adding it to the Coach profile.

Success returns only registration metadata:

```json
{
  "status": "created",
  "coachId": "C001",
  "profileId": "coach-registration-example-uuid",
  "workingTimeZone": "Europe/London"
}
```

HTTP 201 means a new account was created. An identical request retried with the same `requestId` returns HTTP 200 and `already-created`. A different payload using that request ID returns 409. A new request ID may reuse the same email/contact details and creates a separate account, as requested. The account, availability, registration metadata, and existing calendar-feed identity are created in one database transaction. No credentials or broad app state are returned.

## Patch Admin MCP

- `create_coach_profile` accepts the same registration fields and requires the new `coaches:write` scope.
- `update_coach_availability` accepts a stable `coachId` and a complete weekly `availability` array. It requires `coaches:read` and `coaches:write`, preserves the existing Coach's time zone, and allows an empty array to clear availability.
- Both use the same validation and canonical persistence paths as the backend. They do not send email.
- Existing OAuth grants are not expanded automatically. After a separately approved release, adding the new scope needs an explicit new consent grant. Unchanged scopes continue using their existing refresh token.

## Remaining release and Website work

The implementation is local until the separate commit/push/deploy decision. No production service, account, email, environment variable, or OAuth grant has been changed.

The approved mockup still needs a production Website submit handler and notification/VCF delivery before it can create real Coach accounts. That handler must retain one request ID across uncertain retries, send the photo only through the contact-card/email path, and report success only after Patch confirms account creation. This backend contract makes that connection possible without broad Back Office credentials in the browser.

## Local implementation handoff — 16 October 2026

Reason: the existing Coach MCP could read profiles and availability but could not create an account or save availability for the proposed registration flow.

Outcome: the local backend now provides authenticated, atomic Coach registration and separately scoped MCP creation/availability tools. The requested password and London timezone defaults are retained; duplicate contact details are permitted; photos are excluded from Coach profiles. This is backend capability completion, not a live end-to-end registration page.

### Exact change set

In the explicitly approved local Patch OS source:

- Added `services/coach-account-registration.js`: validation, registration service and bounded authenticated HTTP endpoint.
- Added `services/admin-coach-registration-mcp.js`: the two strictly scoped MCP tools.
- Updated `data/sqlite-state.js`: transactional account/availability creation with request-id retry protection, using the existing profile and calendar identity creation path.
- Updated `server.js`: endpoint and MCP wiring; no configured production secret.
- Updated `services/admin-mcp-oauth.js` and `services/admin-messages-mcp.js`: new opt-in Coach write scope and tool registration; no existing grants expanded.
- Added `tests/coach-account-registration.test.js`, `tests/coach-registration-api.test.js`, `tests/coach-registration-server.test.js` and `tests/admin-coach-registration-mcp.test.js`.
- Updated `tests/admin-mcp-oauth.test.js` and `tests/admin-messages-mcp.test.js` with scope and tool coverage.

In Website: recorded Patrick's exact local-only exception in `AGENTS.md`, retained the registration mockup with the requested photo copy and availability-editing guidance, aligned its time ranges with the existing backend format, and added this integration contract. No existing production Website route or submission handler changed.

### Checks and results

- Backend registration, HTTP API, wired disposable-server login and existing Coach/User ICS delivery: **29 passed**.
- MCP registration/availability, OAuth isolation and existing MCP behavior: **80 passed**.
- Website mockup JavaScript syntax check and both repositories' `git diff --check`: passed.
- Independent source review: no blocking findings. Existing Coach/User ICS implementation and availability routes are unchanged.
- Additional existing availability-ownership regression: fails at `tests/coach-availability.test.js:694` because a User timezone update returns 409 rather than the expected 200. Reproduced identically with the modified pre-existing runtime modules loaded from committed HEAD, without changing the working tree. This baseline failure was not fixed or concealed by this feature.

All execution used synthetic disposable state and disabled external integrations. No live Coach accounts, emails, production databases, Railway resources, environment configuration or OAuth grants were accessed or changed. Scoped local Patch OS source was inspected and edited under the explicit exception; it was not treated as production access.

### Remaining work and release decision

Website remains on `codex/recruitment-live-release`; Patch OS remains on `main`. Changes are local and unstaged. The Website mockup and integration documentation are untracked; Patch OS has only the scoped files listed above. No unrelated work was overwritten. No commit, push, deployment or native-app build was performed.

Before real use, separately approve and implement the Website server submit/VCF-email path, configure the server-to-server secret, release the appropriate services, and explicitly consent to the new MCP scope if those tools are wanted. Do not report the preview as connected or live before that work is complete. A transactional availability-update adapter would be optional further hardening against external concurrent timezone changes; current synchronous wiring follows the existing SQLite availability behavior.

Planner decision for this handoff: **do not release yet**. Patrick's confirmation authorized local implementation and testing only.

Finished. Should we push, commit, and deploy? Please make that decision.
