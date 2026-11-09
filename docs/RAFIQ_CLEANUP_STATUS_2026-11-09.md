# RAFIQ cleanup status — 2026-11-09

## Scope implemented on this branch
- Reframed the public home page around the approved medical-centre directory: laboratories, imaging, physiotherapy, and medical-equipment sales/rental.
- Removed non-CV application links from public navigation, regional pages, guides, services, FAQ, and the old web assistant page.
- Removed the general public application page and its non-CV registration/confirmation helper files.
- Retired the general public intake endpoints and legacy web-agent endpoints with HTTP 410 responses.
- Restricted `public-application-intake` to `CV + Cover Letter` only.
- Restricted the associated private upload endpoint to CV documents and payment proof only.
- Preserved the CV service module `src/telegram-cv.ts`, its existing Telegram CV orders migration, and the existing CV pricing/payment workflow source.
- Retired the Supabase Meta WhatsApp webhook source with HTTP 410. WhatsApp remains manual-only through the existing app, number, and channel.
- Added hard-off responses to legacy candidate backend Meta/Kapso webhook/send routes and retired its general public intake proxy.
- Updated environment and integration documentation to describe Telegram automation and manual WhatsApp.

## Existing public links retained
- Telegram bot: https://t.me/RAFIQ_Care_Bot
- Telegram channel/group invite: https://t.me/+a7CDblNyGKw1Yjg8
- WhatsApp channel: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K
- WhatsApp contact: https://wa.me/96181506299

## Important remaining verification
- The existing Supabase `telegram-webhook` source still contains the older care-request workflow. It has not yet been replaced because the directory-only replacement must be reconciled with the preserved CV workflow first.
- The live Telegram webhook registration, bot token, channel permissions, and channel posting have not been inspected or changed.
- No Meta account was accessed. No WhatsApp/Meta/Kapso request or message was sent.
- No Supabase tables, rows, storage objects, or migrations were changed or applied.
- No deployment, Render restart, Vercel deployment, or merge to `main` was performed.

## Safety
This branch is source-only. Do not deploy or merge until the Telegram directory flow and preserved CV/cover-letter flow are both tested in an isolated environment and approved.
