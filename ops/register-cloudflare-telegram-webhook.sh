#!/usr/bin/env bash
set -euo pipefail
read -r -p "Cloudflare Pages production URL (e.g. https://rafiq.example.com): " TELEGRAM_WEBHOOK_URL
TELEGRAM_WEBHOOK_URL="$(printf '%s' "$TELEGRAM_WEBHOOK_URL" | sed 's:/*$::')"
if [[ ! "$TELEGRAM_WEBHOOK_URL" =~ ^https://[^/]+$ ]]; then
  echo "Invalid URL. Use the exact HTTPS Pages origin, without a path."
  exit 2
fi
read -r -s -p "Telegram bot token (hidden): " TELEGRAM_BOT_TOKEN
printf '\n'
read -r -s -p "Telegram webhook secret (hidden): " TELEGRAM_WEBHOOK_SECRET
printf '\n'
if [[ ! "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "Invalid secret format; expected 32-256 allowed characters."
  unset TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET
  exit 2
fi
export TELEGRAM_WEBHOOK_URL TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET
node --input-type=module <<'NODE'
const url = process.env.TELEGRAM_WEBHOOK_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: url + "/api/telegram/webhook", secret_token: secret,
    allowed_updates: ["message","callback_query"], drop_pending_updates: false })
});
const result = await response.json().catch(() => ({}));
if (!response.ok || result.ok !== true) {
  process.stdout.write(JSON.stringify({ok:false,description:typeof result.description === "string" ? result.description : "Telegram rejected setWebhook"}) + "\n");
  process.exitCode = 1;
} else {
  const infoResponse = await fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo");
  const info = await infoResponse.json().catch(() => ({}));
  process.stdout.write(JSON.stringify({ok:true,webhook_url:info?.result?.url || url + "/api/telegram/webhook",
    pending_update_count:Number(info?.result?.pending_update_count || 0),
    has_last_error:Boolean(info?.result?.last_error_message)}) + "\n");
}
NODE
unset TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET TELEGRAM_WEBHOOK_URL
