#!/usr/bin/env bash
# Safe Telegram-only setup for RAFIQ. No WhatsApp reply API is called.
# Default: read-only checks. Use --apply only after reviewing the output.
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN in your local environment}"
: "${TELEGRAM_WEBHOOK_SECRET:?Set TELEGRAM_WEBHOOK_SECRET in your local environment}"
: "${SUPABASE_URL:?Set SUPABASE_URL in your local environment}"
: "${TELEGRAM_OWNER_CHAT_ID:?Set your own private Telegram chat ID}"
[[ "${#TELEGRAM_WEBHOOK_SECRET}" -ge 32 ]] || { echo "TELEGRAM_WEBHOOK_SECRET must be at least 32 characters" >&2; exit 1; }

mode="${1:-}"
[[ -z "$mode" || "$mode" == "--apply" ]] || { echo "Usage: $0 [--apply]" >&2; exit 2; }
TG_URL="${SUPABASE_URL%/}/functions/v1/telegram-webhook"

telegram_get() {
  local method="$1" query="${2:-}"
  {
    printf 'url = "https://api.telegram.org/bot%s/%s' "$TELEGRAM_BOT_TOKEN" "$method"
    [[ -z "$query" ]] || printf '?%s' "$query"
    printf '"\nfail\nshow-error\nsilent\n'
  } | curl --config -
}
telegram_post() {
  local method="$1"
  shift
  {
    printf 'url = "https://api.telegram.org/bot%s/%s"\n' "$TELEGRAM_BOT_TOKEN" "$method"
    printf 'request = "POST"\n'
    for field in "$@"; do
      case "$field" in
        allowed_updates=*) printf 'data = "%s"\n' "$field" ;;
        *) printf 'data-urlencode = "%s"\n' "$field" ;;
      esac
    done
    printf 'fail\nshow-error\nsilent\n'
  } | curl --config -
}

echo "== Telegram bot identity (token hidden) =="
ME="$(telegram_get getMe)"
node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); console.log(JSON.stringify({username:x.result.username,can_join_groups:x.result.can_join_groups,can_read_all_group_messages:x.result.can_read_all_group_messages},null,2)); if(x.result.can_read_all_group_messages!==true) console.log("WARNING: Bot privacy mode appears enabled. Use BotFather /setprivacy -> Disable to receive every discussion-group message.")' "$ME"

echo
echo "== Existing webhook (URL hidden) =="
INFO="$(telegram_get getWebhookInfo)"
node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); console.log(JSON.stringify({has_webhook:Boolean(x.result.url),pending_update_count:x.result.pending_update_count,last_error_date:x.result.last_error_date,last_error_message:x.result.last_error_message,allowed_updates:x.result.allowed_updates},null,2))' "$INFO"

if [[ -n "${TELEGRAM_CHANNEL_ID:-}" ]]; then
  echo
  echo "== Channel bot membership =="
  BOT_ID="$(node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); process.stdout.write(String(x.result.id))' "$ME")"
  CHANNEL_QUERY="$(node -e 'process.stdout.write("chat_id="+encodeURIComponent(process.argv[1])+"&user_id="+process.argv[2])' "$TELEGRAM_CHANNEL_ID" "$BOT_ID")"
  MEMBER="$(telegram_get getChatMember "$CHANNEL_QUERY")"
  node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); console.log(JSON.stringify({status:x.result.status,is_member:x.result.status!=="left"&&x.result.status!=="kicked",can_post_messages:x.result.can_post_messages},null,2))' "$MEMBER"
fi

if [[ -n "${TELEGRAM_DISCUSSION_GROUP_ID:-}" ]]; then
  echo
  echo "== Linked channel discussion-group membership =="
  BOT_ID="$(node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); process.stdout.write(String(x.result.id))' "$ME")"
  GROUP_QUERY="$(node -e 'process.stdout.write("chat_id="+encodeURIComponent(process.argv[1])+"&user_id="+process.argv[2])' "$TELEGRAM_DISCUSSION_GROUP_ID" "$BOT_ID")"
  MEMBER="$(telegram_get getChatMember "$GROUP_QUERY")"
  node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) process.exit(1); console.log(JSON.stringify({status:x.result.status,is_member:x.result.status!=="left"&&x.result.status!=="kicked"},null,2))' "$MEMBER"
fi

echo
echo "== WhatsApp owner relay configuration =="
echo "Meta callback URL: ${SUPABASE_URL%/}/functions/v1/meta-whatsapp-webhook"
echo "Required Supabase Edge Function secrets: META_VERIFY_TOKEN, META_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_CHAT_ID"
echo "No META_ACCESS_TOKEN or META_PHONE_NUMBER_ID is required: RAFIQ never sends WhatsApp messages."
echo "Incoming WhatsApp messages are relayed only to TELEGRAM_OWNER_CHAT_ID; the owner replies manually in WhatsApp."
echo "For channel comments, link a discussion group, add the bot there, and set BotFather /setprivacy to Disable."

if [[ "$mode" == "--apply" ]]; then
  echo
  echo "== Register Telegram webhook (no pending updates dropped) =="
  RESULT="$(telegram_post setWebhook "url=$TG_URL" "secret_token=$TELEGRAM_WEBHOOK_SECRET" 'allowed_updates=%5B%22message%22%2C%22callback_query%22%5D' "drop_pending_updates=false")"
  node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok) { console.error("setWebhook failed"); process.exit(1); } console.log("Telegram webhook registered successfully.")' "$RESULT"
else
  echo
  echo "DRY RUN: no webhook or account settings were changed. Re-run with --apply to register the Telegram webhook."
fi
