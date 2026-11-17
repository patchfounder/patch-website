# M1 Pro Headshot Stage page

The M1 preparation page uses https://www.patch.app/training/prohea, the six-character route Patrick selected on 17 November 2026. Its display title is Pro Headshot Stage; historical S2 / PRE.05, Cal.com identifiers and approved email subjects remain unchanged. The earlier https://www.patch.app/training/premas route also opens the page, preserving existing links.

`src/components/ProHeadshotTraining.jsx` replaces the generic training component only on the M1 Coach route, including its trailing-slash form. Other stage pages, all host pages, legacy Activation routes and server-side room behaviour are preserved. The M1 coach metadata describes the headshot process rather than the former placeholder lesson.

The page includes the professional-brand purpose, original headshot examples, five preparation steps, the exact approved ChatGPT prompt with a copy action, the submission email address and five full LinkedIn profile examples. It reuses the existing mobile Academy layout, IBM Plex typography, Patch Blue, spacing scale and 44px minimum controls. The supplementary profile examples use a native disclosure.

## Canonical content and published asset

The source instructions and prompt remain `/Users/patrick/Desktop/Patch/Coaches/Training/email/pre-masterclass-photo.html`, governed by `/Users/patrick/Desktop/Patch/Coaches/Training/Pre Masterclass photo preparation.md`. This page does not change that email, its subject, signature, original JPEG or delivery exclusions.

The deployment export is `public/training/resources/pro-headshot-examples.jpeg`, served at https://www.patch.app/training/resources/pro-headshot-examples.jpeg. It matches the original `/Users/patrick/Desktop/Patch/Coaches/Stages/S2. PRE.05/PRE.05 Headshot Examples.jpeg`: 86,088 bytes, SHA256 `08f76a53b193c28be0d0ca836399a21a71fb61515597d6b708e6f334d5cdb8ed`. The Website copy is a published export, not a competing editable master. Preserve the hash check when replacing that export.

## Module Call distinction

This is the preparation page, not a call-specific appointment invitation. Its Your Module Call section explains that the personal joining link accompanies the confirmed appointment. It creates no appointment, requests no microphone/camera, polls no booking or room service, and does not connect to the shared M1 room. It does not substitute a Cal.com self-booking link, generic Activation PDF or unrelated placeholder video for the M1 experience.

The separate appointment-aware framework and Ted test proposal remain in `/Users/patrick/Desktop/Patch/Coaches/Training/module-calls`. An invitation still requires the verified external call-specific URL and Patrick's approval of the exact event and email. Publishing the preparation page alone does not make the Ted test booked or its live video operational.

## Scope and checks

The bounded release selects only the M1 component/CSS, its dispatch and metadata, the JPEG export, routing/content tests and this guide. Preserve unrelated Recruitment/Registration work and all existing Coach/User ICS delivery. No Patch OS code, operational data, credentials, calendar, email, account, automation or infrastructure change is part of this page release.

The isolated candidate passed the complete 233-test Website suite and production build. The Pro Headshot URL adds its own metadata page. M1 tests verify the original asset hash, exact prompt and five profile URLs, five steps, clipboard success/fallback and absence of false booking/live-room behaviour. Routing tests preserve every other Coach/host mapping. Browser inspection and deployment verification are recorded in the private Training release receipt after they occur.
