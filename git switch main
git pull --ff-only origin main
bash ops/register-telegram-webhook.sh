git switch main
git pull --ff-only origin main
bash ops/register-telegram-webhook.sh
RESULT=PASS stage=telegram_webhook_registration url_match=true pending_updates=...