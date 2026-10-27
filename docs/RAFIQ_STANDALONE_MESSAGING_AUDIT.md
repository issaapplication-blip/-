# RAFIQ standalone Telegram + WhatsApp integration audit

Audit source: repository `main` at the start of this branch. Changes are proposed on `feat/standalone-messaging-safety`.
This document describes source-level evidence, not live account verification.

## Current topology and safety

- The existing Telegram webhook code is `supabase/functions/telegram-webhook/index.ts`; the repository rollout note reports the existing Supabase Edge Function as ACTIVE, but current live state was not accessible from the integration connector. Do not change the production webhook as part of this PR.
- The candidate Bun/Elysia runtime contains Telegram handlers and optional WhatsApp/Meta/Kapso handlers. It is not proven to be deployed or receiving traffic.
- Telegram webhook verification is designed to fail closed unless the secret header matches a configured secret of at least 32 characters. Update claims and rate limiting use Supabase RPCs; live database behavior still needs verification.
- The source uses the existing Supabase project only. No new project or schema migration is proposed here.
- Runtime secrets must remain in the active hosting provider's secret store. Never commit bot tokens, API keys, webhook secrets, admin IDs, or customer data.

## Telegram link distinction

- Official bot: https://t.me/RAFIQ_Care_Bot
- Official channel (known): https://t.me/+a7CDblNyGKw1Yjg8
- Administrative Telegram group: **not verified in repository settings**. Set `TELEGRAM_GROUP_URL` only after the owner confirms the current group URL. Do not reuse the channel invite as a group link.
- The code can accept manager chat IDs from `TELEGRAM_MANAGER_CHAT_IDS`, but this source setting does not prove that the current production secret exists or points to the intended group.

## Intended flow and known limits

1. Telegram request → validate webhook secret → claim update idempotently → save request/session → attempt admin notification → reply to the user. A notification failure must not be treated as proof that the request was not saved. This flow requires a live isolated test to verify against the current database.
2. Public announcements must be explicitly approved before publication. Scheduled marketing now requires both `TELEGRAM_MARKETING_ENABLED=true` and `RAFIQ_TELEGRAM_SCHEDULED_ADS_APPROVED=true`; both should remain off unless scheduled publishing has been approved. Admin-triggered marketing commands also require `TELEGRAM_MARKETING_ENABLED=true`.
3. Telegram broadcasts should work as text-only messages when no public website/image is configured. Website links and barcode URLs are optional and must never fall back to Render.
4. WhatsApp inbound handlers and outbound individual-message code exist in the repository, including Meta signature verification and Kapso signature verification. This does **not** prove that either provider is configured, authorized, free of additional cost, or live.
5. No WhatsApp Channel publishing endpoint or channel webhook is implemented in this repository. Official WhatsApp Channels are managed through WhatsApp's app interface; do not claim API publishing. Keep publishing to the existing WhatsApp Channel manual unless an official, account-authorized API is verified.
6. The WhatsApp Groups API exists for eligible Business Platform accounts, but eligibility and group linkage must be checked for RAFIQ's current WABA/phone number. The code in this branch does not implement that API, and the existing WhatsApp group must not be recreated or targeted by guessing an ID. Until eligibility and official group API support are proven, use manual forwarding for the existing group.
7. Official WhatsApp 1:1 messaging remains subject to user opt-in, applicable service-window/template rules, provider configuration, and explicit human approval. Do not enable auto-replies or outbound delivery during CI.

## Five assets — evidence-based status

| Asset | Source-level state | Live verification |
|---|---|---|
| `@RAFIQ_Care_Bot` | Existing bot URL and webhook code present | Not verified; token and live `getWebhookInfo` were not queried |
| Telegram administrative group | Config supports manager chat IDs; URL not established | Not verified; owner must supply/confirm current group link and authorized chat ID in the secret store |
| Telegram official channel | Known invite URL configured separately from group URL | Bot's current admin/posting permission not verified |
| WhatsApp group | Individual-message integration exists; group-specific API is not implemented here | Not verified; official Groups API eligibility unknown |
| WhatsApp official channel | Existing public channel link is known | Automated publishing not implemented; use manual app publishing |

## Hosting and deployment

- Do not use Render or any `onrender.com` URL.
- Keep the existing Supabase Edge Function until a replacement is deployed, health-checked, secret-verified, and tested in isolation. This PR does not register or change webhooks.
- Cloudflare Pages is for the website/static frontend; it is not by itself a persistent bot worker.
- Hugging Face Space or another already-available free runtime may be used only after checking its sleep/uptime constraints and confirming repository linkage. This audit did not verify an active deployment or guarantee 24/7 operation.
- No real Telegram or WhatsApp messages were sent. No database, production webhook, group, or channel settings were changed.

## Required owner actions before live acceptance

1. Confirm the current Telegram administrative group URL (not its chat ID in public chat). Set the actual numeric chat ID only in the active runtime's secret settings.
2. Confirm the existing production webhook target and secret configuration without printing either secret. Do not register a replacement until a separate cutover plan is approved.
3. Confirm current WhatsApp provider (Meta Cloud API or Kapso), active WABA/phone-number permissions, webhook delivery, and billing/plan constraints in the provider console.
4. Confirm whether the existing WABA has eligibility for official Groups API; do not infer it from a WABA ID alone.
5. Keep WhatsApp Channel posting manual; approve a first end-to-end test before any outbound message.
6. Run CI and local mocked tests, then perform a single owner-approved private Telegram test and verify request persistence + admin notification. Only after that consider any group/channel test with explicit approval.

## Acceptance boundary

A green build proves only source/test consistency. It does not prove the bot token, webhook, database, group/channel permissions, provider account, deployment, or outbound routing works live.
