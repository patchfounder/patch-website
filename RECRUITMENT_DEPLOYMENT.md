# Website recruitment deployment handoff

## Absolute boundary

Recruitment may be released only through the existing Website/landing-page service. Patch OS and every Patch OS Railway project, service, volume, database, environment, domain, deployment, and integration are out of scope and must not be accessed or changed.

This file is a handoff checklist, not deployment approval. A live release, Railway change, volume attachment, environment change, Resend configuration, or first-cohort creation requires Patrick's separate explicit approval.

## Website-only release checklist

1. Confirm in Railway that the selected project and service are the Website/landing-page service—not Patch OS and not a shared Patch OS resource.
2. Attach a new persistent volume owned only by the Website service and mount it at `/data`.
3. Set `RECRUITMENT_DATA_ROOT=/data/recruitment`.
4. Only after the Website volume is verified, set `RECRUITMENT_PERSISTENCE_ACK=website-volume-mounted`.
5. Set a new Website-only `RECRUITMENT_COOKIE_SECRET` of at least 32 random bytes. Never reuse a Patch OS secret.
6. Set a new exact 12-character `RECRUITMENT_REVIEWER_SECRET` for the private `/assessment/<secret>` link.
7. Configure Website-only Resend values: `RESEND_API_KEY`, `RECRUITMENT_EMAIL_FROM`, optional `RECRUITMENT_EMAIL_REPLY_TO`, and `RECRUITMENT_BOOKING_URL=https://www.patch.app/coaching`.
8. Confirm the Cal.com event now describes a 30-minute Google Meet video interview; changing Cal.com remains a separate action.
9. Run `npm test`, `npm run build`, and verify `/application/` is unchanged at mobile, tablet, and desktop sizes.
10. Release the Website service live using this repository's `railway.json` build, start, and health-check commands.
11. Confirm `/health` returns `200` only after SQLite, private storage, Website-volume acknowledgement, and email configuration are ready.
12. Open the private reviewer link, create the first monthly cohort, and activate it. Send only that cohort's shared password to invited applicants.

No separate production/staging architecture is introduced. The recruitment runtime is part of the Website service and stores its private data only on the Website-owned volume.

## Still required before release

- Rights-approved recruitment gallery photographs, if the photographic rotation is to replace the current designed static gate artwork.
- The real 12-character reviewer secret.
- The first cohort's shared password and Sunday-to-Friday opening window.
- Verified Website-only Resend sender credentials.
- Patrick's explicit live-release approval.
