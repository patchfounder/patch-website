# Patch App Landing Page Launch Checklist

This checklist covers the future migration from the current Unbounce landing page to a new AWS Amplify-hosted landing page for `www.patch.app`.

No item in this checklist should be performed during the current planning and setup phase unless explicitly approved later.

## 1. Pre-Build Readiness

- Confirm the landing page scope and messaging.
- Confirm the app download destinations for iOS and Android.
- Confirm whether any secondary calls to action are needed.
- Confirm brand assets, logo files, colors, fonts, and approved product imagery.
- Confirm that the landing page remains separate from existing Patch app code.
- Confirm that no backend is required for launch.

## 2. Local Build Readiness

- Create the approved static front-end project.
- Build the landing page locally.
- Test the local development server.
- Test the production build locally.
- Verify responsive layouts on desktop, tablet, and mobile widths.
- Verify all app download links.
- Verify all navigation links.
- Verify page metadata, title, description, favicon, and social preview tags.
- Verify accessibility basics, including contrast, focus states, semantic headings, and image alt text.
- Verify performance basics before deployment.

## 3. AWS Amplify Preparation

- Confirm the AWS account and Amplify app destination.
- Confirm the approved repository source when ready.
- Connect the landing page repository to AWS Amplify.
- Configure the Amplify build settings for a static Vite site.
- Confirm that no backend services are created.
- Confirm that no secrets or private credentials are committed.

Typical Vite build settings:

```text
Build command: npm run build
Output directory: dist
```

## 4. Amplify Staging Verification

- Deploy to an Amplify staging URL first.
- Open and test the Amplify staging URL.
- Verify the page loads correctly.
- Verify mobile and desktop layouts.
- Verify app download calls to action.
- Verify metadata and social sharing previews.
- Verify SSL behavior on the staging URL.
- Check browser console errors.
- Check for broken assets or missing images.
- Confirm that the staging URL is approved before any DNS change.

## 5. Squarespace DNS Review

The domain registration and DNS are currently managed through Squarespace because Google Domains moved there.

Before changing DNS:

- Log in to Squarespace only when approved.
- Confirm current DNS records for `patch.app`.
- Identify existing records related to `www.patch.app`.
- Confirm whether the root domain `patch.app` should redirect to `www.patch.app`.
- Record the current DNS configuration before making changes.
- Confirm the exact AWS Amplify DNS records required.
- Do not remove unrelated records.
- Do not interfere with email, verification, or other service records.

## 6. DNS Switch To AWS Amplify

Only after Amplify staging is approved:

- Add or update the required DNS record for `www.patch.app` in Squarespace.
- Follow AWS Amplify domain verification instructions.
- Wait for DNS propagation.
- Confirm that AWS Amplify shows the custom domain as connected.
- Confirm that SSL certificate provisioning is complete.
- Do not cancel Unbounce during DNS propagation.

## 7. Live Site Verification

After DNS propagation:

- Visit `https://www.patch.app`.
- Confirm the AWS Amplify-hosted landing page loads.
- Confirm HTTPS works correctly.
- Confirm redirects behave as intended.
- Confirm mobile and desktop layouts.
- Confirm app download links.
- Confirm social preview metadata.
- Confirm no staging-only content remains.
- Confirm no broken assets or console errors.
- Confirm the site is stable across multiple checks.

## 8. Unbounce Retirement

Only after the new AWS Amplify site is live and verified:

- Confirm that `www.patch.app` no longer depends on Unbounce.
- Confirm no active campaigns still require the Unbounce page.
- Confirm any analytics, tracking, or conversion reporting implications.
- Keep a record of the old Unbounce setup for reference.
- Cancel, archive, or retire Unbounce only after the Amplify migration is confirmed complete.

## 9. Post-Launch Monitoring

- Recheck `https://www.patch.app` after DNS propagation completes.
- Recheck the site after 24 hours.
- Monitor app download call-to-action behavior.
- Monitor page performance.
- Watch for broken links, certificate issues, or DNS regressions.
- Keep the deployment process documented for future updates.
