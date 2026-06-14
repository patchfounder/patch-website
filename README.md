# Patch App Landing Page

This folder is the planning and setup workspace for the future Patch App landing page at `www.patch.app`.

Patch App is moving from a manual onboarding model to an app-first model. The future landing page should support that shift by presenting Patch as a premium mobile-first legal technology product and by directing visitors toward downloading the Patch app.

This project must remain separate from any existing Patch app code. During this setup phase, no backend, deployment, DNS change, third-party connection, or production migration should be performed.

## Recommended Technical Approach

The recommended approach is a lightweight static front-end built with React and Vite.

React and Vite are a good fit because:

- The landing page can remain fully static and does not require a backend.
- Vite provides a fast local development workflow.
- React makes it easier to build polished, reusable landing page sections later.
- AWS Amplify supports Vite static builds cleanly.
- The site can be deployed as static assets after `npm run build`.
- The approach leaves room for future conversion tracking, app store links, localized content, and staged page iteration.

Plain HTML, CSS, and JavaScript would also work, but React and Vite provide a better foundation for a premium app-first landing page without adding unnecessary backend complexity.

## Current Setup Phase

The current phase is a lightweight React/Vite scaffold for local preview only.

Planning files:

- `README.md`: project purpose, recommended setup, local preview plan, and future deployment plan.
- `PROJECT_BRIEF.md`: commercial strategy, audience, design direction, and conversion goal.
- `LAUNCH_CHECKLIST.md`: future migration checklist from Unbounce to AWS Amplify.

Scaffold files:

- `package.json`: local Vite scripts and front-end dependencies.
- `index.html`: static HTML entry point.
- `src/`: React application source files.

The visual landing page has not been designed yet.
No AWS, Squarespace, GitHub, or Unbounce connections have been made.

## Proposed Future Folder Structure

The project currently uses this structure:

```text
.
├── README.md
├── PROJECT_BRIEF.md
├── LAUNCH_CHECKLIST.md
├── package.json
├── index.html
├── vite.config.js
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── styles.css
    ├── components/
    │   ├── Header.jsx
    │   ├── Hero.jsx
    │   ├── AppDownloadCTA.jsx
    │   ├── HowItWorks.jsx
    │   ├── SocialProof.jsx
    │   ├── FAQ.jsx
    │   └── Footer.jsx
    └── assets/
```

This structure keeps the landing page self-contained and clearly separated from any Patch app source code.

## Local Preview Plan

The expected local workflow is:

```bash
npm install
npm run dev
```

The local preview will normally run at:

```text
http://localhost:5173
```

Before any deployment, the site should also be tested with:

```bash
npm run build
npm run preview
```

## Future AWS Amplify Deployment Plan

The future deployment plan is:

1. Build the landing page as a static React/Vite site.
2. Commit the project to the approved repository when ready.
3. Connect the repository to AWS Amplify.
4. Configure Amplify to build the static site.
5. Test the Amplify staging URL thoroughly.
6. Confirm DNS records in Squarespace, where the domain is currently managed.
7. Point `www.patch.app` to AWS Amplify only after staging has been verified.
8. Verify the live site at `www.patch.app`.
9. Keep Unbounce active until the Amplify-hosted site is confirmed live and stable.
10. Cancel or retire Unbounce only after the migration is complete and verified.

No deployment or DNS work should happen during the current setup phase.
