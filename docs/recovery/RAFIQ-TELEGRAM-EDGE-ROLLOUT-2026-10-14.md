# RAFIQ Supabase security and Telegram Edge rollout

## Current production findings (2026-10-14)
- `rafiq-agent` is ACTIVE v9; the secured model-routing change is already merged via PR #34.
- `meta-whatsapp-webhook` is ACTIVE v5, `verify_jwt=false`, and the hard-off guard is active. Do not enable automated outbound until the personal-number test is complete.
- PR #35 is merged; production already has `telegram_update_receipts` and the atomic `claim_telegram_update(bigint,integer)` RPC.
- Ten server-only tables had RLS enabled but no policies. A reversible live migration added explicit `service_role`-only policies; a post-migration SQL check returned no public RLS tables without policies.
- `manager_folder_counts()` was callable by public roles and has been restricted to `service_role`; the admin status setter has also had anon EXECUTE revoked.
- Leaked-password protection is still disabled in the live Auth configuration; the Auth Dashboard control still requires a manual enablement.

## Telegram function requirements
Set these names in Supabase Edge Function secrets (never in GitHub):
- `TELEGRAM_BOT_TOKEN`: existing bot token for @RAFIQ_Care_Bot.
- `TELEGRAM_WEBHOOK_SECRET`: strong random value at least 32 characters, using only Telegram-supported characters.
- `TELEGRAM_MANAGER_CHAT_IDS`: comma-separated manager chat IDs (optional, needed to notify managers about submitted requests).

Function URL after deployment:
`https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook`

Register the webhook only after the secrets are saved and a signed synthetic test has passed; keep `drop_pending_updates=false`. This function uses local guided FAQs and request collection and does not send care/health messages or phone numbers to Gemini/OpenAI.

## Rollback
1. Restore the previous webhook destination in Telegram only if the old hosting endpoint is viable (Render is currently suspended).
2. Redeploy the prior `telegram-webhook` version or remove the webhook registration.
3. Run `20261014121820_rafiq_security_telegram_rollback.sql` to remove the policies and revoke/drop the rate-limit RPC; it deliberately preserves the rate-limit table and all its rows.
4. Do not change `WHATSAPP_AUTOREPLY_ENABLED` as part of this rollback.


## Optional Cloudflare Workers AI for Telegram
The webhook defaults to guided FAQs until these optional Supabase Edge Function secrets are set:
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account identifier.
- `CLOUDFLARE_API_TOKEN`: a narrowly scoped token that can run Workers AI for this account; do not use an account-wide administrator token.
- `CLOUDFLARE_AI_MODEL`: optional; default is `@cf/meta/llama-3.1-8b-instruct`.

Cloudflare documents this model at https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct/ and a 10,000-neuron/day Free allocation at https://developers.cloudflare.com/workers-ai/platform/pricing/. Cloudflare states it does not use Workers AI customer content to train or improve models/services unless explicit consent is provided: https://developers.cloudflare.com/workers-ai/platform/data-usage/. The webhook redacts phone numbers and sends only sanitized question text; it does not send chat IDs, Telegram user IDs, request sessions, or stored records. Without the two required secrets, the function remains on guided fallback.
