# RAFIQ integration map — updated 2026-11-09

## Source state
- PR #86 merged into `main`: `036e12ce1d668f30c79ce2fabc240b81e348da23`.
- Public platform is now a medical-centre directory: laboratories, imaging/radiology, physiotherapy, and medical-equipment sales/rental.
- General public care, provider, member, and centre application flows were removed. CV + Cover Letter remains separate.
- Telegram Edge Function source is directory-only and has a separate `/cv` path.
- PR #87 adds an explicit channel URL button to the Telegram bot's directory keyboard and is in verification.

## Existing Telegram endpoints
| Item | Existing value | Current source status |
|---|---|---|
| Bot | https://t.me/RAFIQ_Care_Bot | Existing identity retained; main source is directory-only |
| Channel | https://t.me/+a7CDblNyGKw1Yjg8 | Existing invite retained; bot menu channel shortcut under PR #87 |
| Supabase project | `qmuxaehrahfsnabyjens` | Existing project only |
| Edge Function | `telegram-webhook` | Source in `supabase/functions/telegram-webhook/index.ts` |
| Function URL | `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook` | Existing URL; live webhook registration not re-verified |
| Webhook registration helper | `ops/register-telegram-webhook.sh` | Use only after deployment and signed verification |

## Channel and posting policy
- The bot links users to the existing channel.
- The current channel posting policy is manual, after admin approval.
- The bot has not been granted channel administrator rights by this code change.
- Automatic channel posting is not implemented or enabled.
- Future automatic posting would require explicit approval, the bot's `can_post_messages` permission, the actual channel chat ID, and a tested approval workflow.

## WhatsApp
- Existing number: +961 81 506 299.
- Existing channel: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K.
- Manual application/channel use only. Meta Cloud API, Kapso, WhatsApp webhooks, and automated sends are retired.

## Supabase production verification
The latest attempt to read the user's existing Supabase project, migrations, and Edge Functions returned a connector permission error. No project read, deployment, secret update, database write, migration, or webhook update succeeded in this session. Restore authorized access to the existing project before deploying the merged Telegram source.

## Hosting boundary
- Do not use Render.
- Do not create another Supabase project.
- Do not create a separate Cloudflare D1 database for Telegram.
- Static platform delivery and the existing Supabase Edge Function remain distinct deployment steps.
