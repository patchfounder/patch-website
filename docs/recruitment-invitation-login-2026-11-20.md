# Application invitation codes — 20 November 2026

## Reason

Patrick requested that an invitation code replace the shared application password, activate application access and register the referral. He explicitly authorised the Website commit, push and existing-service deployment.

## Expected outcome

At https://www.patch.app/application/ an applicant enters a registered invitation code, completes the existing application and has that code and its referring Coach recorded with the submission. Private assessment cards show the attribution. Credits and gifts remain manual.

## Scope and invariants

Allowed UI changes are the application gate's label, explanation and validation copy; hiding its obsolete assessment Change Password action; and two attribution rows inside the existing private applicant card. Preserve existing styles, spacing tokens, form fields, recording/upload flow, assessment outcomes and actions, private playback, reviewer access, the separate administration password and master-password redirect. Preserve all Coach/User ICS behaviour, existing data, emails, other Website routes and unrelated work.

Patch OS was not accessed or modified. No Website runtime, build, database, filesystem or network dependency on Patch OS is introduced. The Website uses its existing private SQLite database and hosting service.

The original Website checkout contains 18 pre-existing modified/untracked paths. Implementation and verification use a separate local clone based on `bc944567b50bca55b50c767290a0b4d3be28e872`; those 18 paths are excluded and their bytes/state are preserved. Do not upload the original dirty checkout. Its unfinished recruitment review work also uses schema version 4; a future merge must reconcile both additive schemas rather than relying on that version number alone.

## Implementation

- Schema version 4 adds a private invitation registry and nullable application attribution columns. Migration retains all prior application, email, decision and audio metadata.
- `RECRUITMENT_INVITATIONS_JSON` bootstraps approved code-to-Coach mappings into that registry on the Website service. Existing mappings cannot be reassigned and revoked codes are not reactivated by restart. New referring Coaches require approved registry maintenance; there is no automatic account synchronisation.
- Codes are normalised for case and surrounding whitespace, retaining leading zeros. Merely resembling a Coach ID is insufficient: a registry entry must exist and be active.
- Signed applicant cookies bind code, Coach, intake, invitation revision and expiry. Public applicant routes reject old password cookies. The old shared application password cannot unlock the form; the separate administration password remains available.
- Submission derives attribution from that authenticated session and revalidates the invitation in the SQLite save transaction. Posted attribution fields cannot replace it. A rejected save cleans up its promoted recording.
- New attribution appears only in the existing private assessment UI. Existing read-only recruitment monitor response allowlists are unchanged.

## Validation

`npm run check` passed: 256 tests, zero failures, and a successful production build with seven route metadata pages. Tests include the actual HTTP login/upload/reviewer flow, unregistered/retired/revoked codes, old cookies, expiry, forged attribution, revocation during save and private-audio cleanup. A populated legacy database migration retains the original rows, outcomes and audio bytes. Component tests exercise the invitation request, hidden password control and visible saved attribution.

`git diff --check` passed. Browser verification has not run: Patrick's separate browser-control permission is pending. Required initial viewport checks are 375×812, 390×844 and 430×932.

## Release handoff

Patrick's commit/push/deploy decision is already granted. Deployment remains pending the separately requested bounded permission to obtain existing Coach IDs through Patch Admin MCP, populate the Website registry, and the requested browser verification permission. Do not deploy with an empty invitation registry. No real applicants, Coach accounts or emails were created for testing.

Use only the existing Website project `4b4ec775-1eec-4b79-902d-efdf94ad19da`, production environment `69996cb9-31c8-4a57-9d47-4bb1f8a583bb` and service `97cd9b78-3e8b-440e-85c1-ee35885aa7c0`. Its existing deployment was confirmed successful at the base commit; no production configuration was changed. Export the exact scoped commit for upload and keep real invitation seeds in server-only configuration, outside Git and browser assets. Verify health, deployed source, gate copy, valid/invalid-code access and administration availability without submitting a live application. Record actual release evidence separately.

After deployment, request Patrick's authenticated 20-page Back Office refresh and retain its result as pending until he reports it. Do not claim a production performance pass from these local tests.
