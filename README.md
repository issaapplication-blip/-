---
title: RAFIQ Backend
emoji: 🏠
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# RAFIQ | رفيق — Backend API

نصل بالحب والأمان لرعاية العائلة

## Runtime and safety defaults

- Bun 1.3.10 + Elysia; listens on port 7860 by default.
- Health check: `GET /health`; status: `GET /api/status`.
- Outbound WhatsApp sending, WhatsApp auto-replies, Telegram broadcasts/marketing, automatic Telegram webhook registration, and Kapso are disabled by container defaults.
- Keep provider tokens and server-side Supabase credentials in the Space's secret environment settings. Never commit them.
- Use only the existing Supabase project: `https://qmuxaehrahfsnabyjens.supabase.co`.
- Never put a Supabase service-role key in static assets or client-visible variables.

## Required configuration

Configure only the secrets/features required for the intended test. Review `docs/RAFIQ_DEPLOYMENT_RUNBOOK.md` before enabling any integration. Keep the current Supabase Edge Function as the documented Telegram receiver until a replacement is verified and deliberately switched.

## Deployment note

A GitHub commit does not automatically deploy this source to the Hugging Face Space unless that Space is configured to build from this repository. Verify the Space's source configuration and inspect `/health` after build. Free Space availability and sleep behavior are controlled by Hugging Face; scheduled pings do not guarantee continuous uptime.
