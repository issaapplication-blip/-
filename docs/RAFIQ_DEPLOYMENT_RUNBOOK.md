# RAFIQ deployment and recovery runbook

## Hugging Face Space
1. Connect the Space to the repository/branch containing this Dockerfile, or publish the reviewed backend source to the Space repository through its supported source workflow.
2. Select Docker SDK and confirm Space port 7860.
3. Set only necessary secrets in Space Settings. Never place tokens in GitHub, HTML, logs, or chat.
4. Keep these safe defaults unless a separate reviewed test plan explicitly changes them: `WHATSAPP_SENDING_ENABLED=false`, `RAFIQ_WHATSAPP_AUTO_REPLY=false`, `RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING=false`, `RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK=false`, `TELEGRAM_MARKETING_ENABLED=false`, `TELEGRAM_BROADCAST_ON_START=false`, `KAPSO_ENABLED=false`.
5. Test `/health` and `/api/status`; inspect logs and test public pages without sending outbound messages.

## Cloudflare Pages
- Repository: `issaapplication-blip/-`; branch: `main`.
- Build command: `bash ops/build-cloudflare-pages.sh`.
- Output directory: `dist`; root: repository root; Functions directory: `functions/`.
- Set `RAFIQ_PUBLIC_BASE_URL` to the exact origin assigned by Cloudflare, not the retired Render URL.
- Set `SUPABASE_URL=https://qmuxaehrahfsnabyjens.supabase.co` and the existing project's public anon key where required. Never use service-role in the frontend.
- Optional Workers AI binding is documented in `docs/recovery/RAFIQ-CLOUDFLARE-PAGES-SETUP-2026-10-14.md`.

## Telegram
- Current documented webhook: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook`.
- Existing helper `ops/register-telegram-webhook.sh` targets that URL and prompts locally for hidden values. Do not change it to Hugging Face until the candidate endpoint has been deployed and tested.
- A successful webhook registration is not a successful end-to-end bot test; verify receipt/reply separately and do not send bulk messages.

## Recovery safeguards
- Never delete or recreate Supabase tables during hosting migration.
- Keep WhatsApp sending and auto-replies disabled.
- Scheduled health pings do not guarantee free-tier uptime or prevent all sleep behavior.
- Record actual URLs, build identifiers, health checks and failures; never invent a deployment URL.
