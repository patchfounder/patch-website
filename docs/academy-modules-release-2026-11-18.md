# Numbered Academy preparation pages

## Reason

Patrick approved the clean module-page mock-up and explicitly requested all six pages built, committed, pushed and deployed on 18 November 2026. Meetings belong inside Patch; these Website pages provide learning and preparation.

## Expected outcome

| Page | Stage | Preserved historical code |
| --- | --- | --- |
| https://www.patch.app/M1 | Activation | ACT.30 |
| https://www.patch.app/M2 | Pro Headshot | PRE.05 / historical Module 1 |
| https://www.patch.app/M3 | LinkedIn Makeover | MC.15 / historical Module 2 |
| https://www.patch.app/M4 | LinkedIn Activity | LA.05 / historical Module 3 |
| https://www.patch.app/M5 | Know Your Coach | KC.05 / historical Module 4 |
| https://www.patch.app/M6 | Certification | CT.10 / historical Module 5 |

`src/academy-modules.js` is the public presentation map. `AcademyModule.jsx` and its scoped CSS provide one responsive learning-page pattern. This new display numbering does not rewrite historical Coach evidence, old stage codes, booking IDs or module outcomes.

Each page contains its purpose, tutorial or clearly labelled forthcoming tutorial, preparation steps, relevant resources and a small in-app call note. Existing videos are reused only for Activation and photo preparation. The LinkedIn Makeover, LinkedIn Activity, Know Your Coach and Certification tutorial areas truthfully say that their tutorials are coming soon; their preparation instructions are usable now. Visual QA found the previous LinkedIn Activity YouTube video unavailable, so that broken embed is not carried into the new page. The original Call Process PDF and headshot example JPEG remain unchanged.

The headshot page retains the five photo steps, exact approved ChatGPT prompt, copy success/fallback and five full public LinkedIn examples. Know Your Coach distinguishes the two short 68/85-character video examples from the separate, more flexible post copy. Certification explains review and private email delivery; it does not expose individual certificates or award completion automatically.

## Scope and invariants

Only the six new public preparation routes, their shared content/component/styles, the entry-point dispatch, route metadata, focused routing/content tests and this document are changed. All existing Website routes, host routes, room services and stored room records remain compatible. The new pages neither import a meeting-room client nor poll a room endpoint or request camera/microphone access.

The approved product treatment uses Patch Blue `#00A5C0`, the existing IBM Plex/system typography, a single 736px content column, 20px mobile and 24px desktop edges, the 8/12/16/24/32/40/48px spacing scale, full visible URLs and at least 44px interactive targets. A video area is 16:9 and supports native fullscreen. There is no external meeting section, booking form or invented app deep link.

No Coach/User app code, authentication, LiveKit configuration, calendar events, emails, account records, training progress, credentials, infrastructure settings or automations are changed. The in-app Support Call work remains owned by Admin User Planner and its own release. Publishing these pages does not claim that the planned in-app call feature is already deployed. Patch OS is outside this Website implementation and release.

**ICS preservation:** Do not modify, remove, disable, replace, or change the behavior of the existing Coach and User ICS delivery features. This includes individual ICS files delivered through Coach or User front-end download buttons and ICS files or attachments delivered to Coaches or Users by email. Preserve the current event contents, call times and time zones, duration, UID, filename and content type, recipients, and send/download triggers. Do not redirect this delivery to calendar subscriptions or treat a subscription feed as its replacement. Keep both front-end downloads and email ICS delivery working as they do today. Include or retain regression coverage for Coach and User front-end ICS downloads and email ICS delivery, and stop to report if the scoped change could affect them. Any intentional change to these protected ICS features requires Patrick's explicit authorization and separate scope.

## Release isolation

The 18 pre-existing Registration/Recruitment paths, including AGENTS.md, remain outside the release. Preserve their exact bytes and unstaged/untracked state. Test a clean export of committed HEAD plus only the Academy selection, then deploy a fresh archive of the actual scoped commit through the existing Website service. Do not upload the dirty working directory or change service configuration, credentials or storage.

Patrick's current instruction authorizes this scoped commit, push and deployment. Browser control still requires the separate task-specific affirmative reply. Record actual tests, browser checks, deployed commit and live verification in the private Training release receipt.

## Format cleanup — 18 November 2026

Patrick requested removal of the Academy label, the Activation “Bring your questions” sentence, the authored tutorial caption and YouTube URL, and the complete footer containing the in-app call note and next-module link. Apply the shared label/caption/footer simplification consistently across the six numbered pages. The numbered page metadata now ends with “Patch”. The Activation introduction and first preparation step no longer repeat the seven-step label; its iframe retains a neutral accessible “Activation tutorial” title.

Keep the actual embedded videos, module identity and progress label, headings, remaining preparation content, resources, downloads, headshot copy control, layout tokens and all legacy routes unchanged. YouTube's own player artwork and overlays remain controlled by the original video. Internal historical mapping and next-module data remain intact, but no next-module navigation is rendered. Patrick explicitly authorised the scoped commit, push and existing Website deployment for this cleanup. The same ICS, unrelated-work and Patch OS protections above remain in force.

## Website retirement — 18 November 2026

Patrick subsequently moved the learning experience to module YouTube videos, emailed PDFs and the planned in-app Support Calls. He explicitly requested removal of the recently built module websites while preserving the modules, future videos and material development, followed by a current Website page inventory.

Retire the 22 recent presentation URLs: `/M1`–`/M6`, `/training`, `/training/prohea`, `/training/activation` and its `/host` alias, and the six `/training/{activa,premas,linkmc,linkac,knowyc,certif}` pages and their `/host` counterparts. Return a non-cached 404 for their GET/HEAD requests, including trailing-slash and direct `index.html` variants, before the Website's static/SPA fallback. Remove their client dispatch and generated metadata. Preserve all curriculum data/component sources, the canonical Training folder, historical records, PDF/JPEG/video references, room APIs and private room state. Do not block the whole `/training/` prefix: resource downloads remain valid.

The older booking and tutorial-content pages are outside this recent training-page retirement. The source inventory after this change has 18 explicit page routes, including 2 private administration screens; aliases, query/hash variations, resource files, APIs and the generic SPA fallback are not additional pages. Verify the count against the actual deployed service. This scope uses the same existing Website release and preserves all 18 unrelated Registration/Recruitment paths byte-for-byte. Patch OS is outside the change and is not accessed or modified.
