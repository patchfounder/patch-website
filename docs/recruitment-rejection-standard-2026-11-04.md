# Approved Stage One rejection standard

Date: 4 November 2026

Status: implemented and verified; Patrick explicitly approved commit, push and Website production deployment on 4 November 2026.

## Reason

Patrick approved the email preview sent to his own account and requested that the Resend rejection email use its wording, formatting and signature as the standard. The previous automated Stage One reply used first-person wording, fixed body typography and an older signature asset.

## Expected outcome

Future confirmed Stage One Fail outcomes use the approved neutral copy, inherited normal mail-client typography, a separate Patrick sign-off and exactly one unchanged canonical HTML signature.

Subject: Your Patch application

Hi {{first_name}},

Thank you for your interest in Patch and for taking the time to submit your recording.

Unfortunately, your application has not been selected for the next stage on this occasion.

Thank you again for the time and effort put into your application, and best wishes for the future.

Kind regards,

Patrick

The canonical signature follows the personal sign-off.

## Scope and invariants

- `server/recruitment-email.js`: approved rejection plain text and HTML, canonical paragraph gaps and inherited body typography.
- `server/patrick-email-signature.html`: independent static Website snapshot of the exact signature Patrick approved. SHA256: `e86df3b54f63306ae5711452b481d6c524df3555dda2bb47c9d62ca23571d9ca`.
- `test/recruitment-email.test.js`: approved copy and formatting, exact single signature, separate sign-off, HTML escaping and existing sending boundaries.
- Pass invitation and team draft text, provider sender/reply-to configuration, decisions, accounts, registration, recordings and one-attempt rejection delivery remain unchanged. No email was sent by this implementation or its tests, and no applicant outcome was recorded.
- Patrick's designated canonical email files in Patch OS were read only as the approved reference for this explicit request. No Patch OS file was modified, and no Website runtime, build or test dependency on Patch OS was added. All implementation files remain in Website.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Validation

- Generated synthetic Resend HTML matched the actual approved self-preview byte for byte after substituting a synthetic greeting. This preserves the layout Patrick already reviewed; no new layout was introduced.
- Authored body has no explicit font family, font size or line height and no first-person I/we wording. Both plain text and HTML include the separate personal Patrick sign-off before the complete signature.
- `npm test`: 147/147 passed, including exact Pass draft and team draft behaviour, rejection send-once/failure behaviour, greeting escaping, backend state and registration regressions. Fixtures were synthetic and disposable.
- `npm run build`: passed; 15 route metadata pages generated.
- `git diff --check`: passed.

## Release handoff

Website began clean on `codex/recruitment-live-release` at `4f5ca17`. The release includes only the three scoped source/test files and this handoff. Provider configuration and applicant records are outside the release scope; no live email is required for verification.

Independent Planner accepted the implementation with no actionable issues. Patrick answered “yes” to the explicit request “May I commit, push and deploy it?”, satisfying Website `AGENTS.md` lines 72–73 for this bounded release. Existing production From and Reply-To configuration is preserved; its live value was not inspected in this implementation.

The deployment outcome and serving-health checks are recorded separately after execution. No production activation is claimed by the pre-release validation above.
