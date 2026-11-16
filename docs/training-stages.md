# Training stage pages

The public route and presentation source is `src/training-stages.js`. It feeds the shared frontend, route metadata and allowlisted room factory. Maintain this map rather than copying six separate page implementations.

| Stage | Coach page | Host page |
| --- | --- | --- |
| Activation | https://www.patch.app/training/activa | https://www.patch.app/training/activa/host |
| Module 1 — Pre-Masterclass | https://www.patch.app/training/premas | https://www.patch.app/training/premas/host |
| Module 2 — LinkedIn Masterclass | https://www.patch.app/training/linkmc | https://www.patch.app/training/linkmc/host |
| Module 3 — LinkedIn Activity | https://www.patch.app/training/linkac | https://www.patch.app/training/linkac/host |
| Module 4 — Know Your Coach | https://www.patch.app/training/knowyc | https://www.patch.app/training/knowyc/host |
| Module 5 — Certification | https://www.patch.app/training/certif | https://www.patch.app/training/certif/host |

Each page uses the approved mobile Activation template, turquoise room, timer, settings cog, two equal device selectors and two equal media controls. Enter starts media; a red Leave appears only while connected. The host room holds Patrick plus one coach. No manual room setup or typed password is introduced.

Activation retains its real seven-step video. The other five pages temporarily reuse that video, explicitly marked as a placeholder. Replace their video fields in the stage map when final tutorials are ready. The existing Patch Call Process PDF is retained as a general reference, not presented as finished module-specific material. Preserve the established single-column grid, 20px mobile edges, 24px desktop edges and 8/12/16/24/32/40/48px spacing scale.

## Rooms and progress

Each stage has a separate allowlisted API, private state file, cookie names/path and LiveKit room namespace. All use the existing Website LiveKit credentials, configured privately on the existing service. Activation’s original namespace, cookie path, records and API remain unchanged; https://www.patch.app/training/activation and https://www.patch.app/training/activation/host remain working. The new Activation URL uses the same existing Activation room rather than a second copy.

Host Leave confirms room closure and exposes the next stage only to a coach actually admitted to that call. On the new pages, the handoff links to the next six-letter page. The original Activation page retains its old https://www.patch.app/pre/ handoff. Certification has no next-stage link and does not award certification by itself. These room handoffs do not modify Coach training records, issue certificates or infer completion from a visit, timer or disconnect.

Booking links use the existing corresponding booking pages. The five new module pages do not claim that existing appointments have changed to five minutes. Cal.com bookings are not ingested into room state; there is no invented scheduled countdown or automatic opening. Existing bookings, availability, emails, accounts and native app remain unchanged.

## Release boundaries

Deploy through the existing Website service with its existing private volume and credentials. Do not include unrelated registration/recruitment work. Verification uses synthetic local rooms and read-only production status; do not open, join, close or remove participants in a live call as a test. No Patch OS access or modification is needed.
