# RAFIQ — isolated free-host agent test

**This is a staging-only branch, not production. Do not merge it into `main`.**
Branch: `staging/agent-coolify-test-20261011`

## What this environment does

- Packages the Bun/Elysia service in a Docker image for Coolify or another Docker host.
- Offers a small Arabic test page at `/` to send synthetic prompts to the real model provider.
- Requires a private `RAFIQ_STAGING_TEST_TOKEN` header for `POST /api/agent/chat`.
- Allows only `/`, `/health`, `/api/status`, and the guarded agent test API. All other routes—including application forms, admin pages, barcode lookup, uploads, and WhatsApp/Kapso endpoints—return 404.
- Does not register any Telegram webhook, run Telegram marketing, or send Telegram broadcasts, even if messaging variables are accidentally added.
- Does not need or use Supabase credentials for the HTTP agent test. It does not persist requests or conversation history.
- Excludes `طلبات/`, secrets, local environment files, and backup ZIP files from the Docker build context.

The agent test endpoint uses Gemini when `GEMINI_API_KEY` is configured. Provider input redaction is best-effort, not a guarantee of anonymization. Use synthetic, non-identifiable examples only—never real patient names, telephone numbers, health records, documents, or provider contacts. Free-tier model providers may process prompts under their own data terms.

## Required host environment

Configure these values in the host dashboard, not in Git:

- `PORT=3000`
- `NODE_ENV=production`
- `GEMINI_API_KEY=<your own Gemini API key>`
- `RAFIQ_GEMINI_MODEL=gemini-2.5-flash`
- `RAFIQ_STAGING_TEST_TOKEN=<a random secret of at least 32 characters>`

Generate the staging test token in your own trusted environment; for example, with `openssl rand -hex 32`. Keep it out of chat, GitHub, screenshots, URLs, and logs. Enter it only in the password field on the staging test page.

Do **not** configure `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `META_ACCESS_TOKEN`, `KAPSO_API_KEY`, `TELEGRAM_BROADCAST_ON_START`, or any production bot/webhook secrets for this first test. Do not attach a production database or production Telegram bot to this branch.

## Preferred no-hosting-fee route: Oracle Always Free + Coolify

This route uses two separate components:
- **Coolify** is the free, open-source deployment platform you operate yourself: https://coolify.io/
- **Oracle Always Free** is the compute host. Oracle's free resources and eligibility rules can change; capacity may be unavailable in a region and idle free VMs may be reclaimed. Never select a paid resource or upgrade plan just to complete this test.

Official references:
- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Coolify self-hosting requirements: https://coolify.io/docs/start-with-self-hosted
- Coolify installation and firewall guidance: https://coolify.io/docs/installation

Suggested setup:
1. In Oracle Cloud, create an **Always Free-eligible Ubuntu ARM/Ampere A1** VM in your home region. The current Always Free allowance is up to 2 OCPU and 12 GB RAM in total; confirm that the console labels the selected resources Always Free before creating them. If capacity is unavailable, do not switch to paid resources.
2. Use your own SSH key. Keep the private key private; never upload it to this repository or send it in chat.
3. Follow Coolify's official installation documentation on a fresh supported Linux server. Secure the dashboard and firewall as the documentation specifies. Keep SSH restricted to your own IP where practical; expose only the web ports needed for HTTPS.
4. In Coolify, add this GitHub repository and choose branch `staging/agent-coolify-test-20261011`. Select the Dockerfile builder, expose port `3000`, and attach a domain with HTTPS.
5. Set the five required environment variables above, then deploy. Confirm that the service is healthy before entering the test token.
6. Open the staging URL and ask synthetic questions such as “ما الخدمات التي تقدمها رفيق؟” or “What services does RAFIQ provide?”. Verify the displayed model name and response. The test page stores neither the token nor chat messages in browser storage.

## Validation gates

Before connecting any real Telegram test bot, enabling request intake, or reviewing database persistence, stop and review data isolation separately. This branch deliberately blocks Telegram webhooks and all database-backed routes; it is intended for testing the model response only. A passing build or answer from the model is not proof that the full Telegram workflow, database writes, security policy, or production deployment has passed.
