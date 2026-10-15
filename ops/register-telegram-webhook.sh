#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Safe one-time registration helper. Secret values are entered interactively and
# are never written to disk, printed, or passed as command-line arguments.
python3 - <<'PY'
import getpass
import json
import re
import urllib.error
import urllib.request

HOOK_URL = "https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook"
bot = getpass.getpass("Telegram Bot API token (entered locally; hidden): ").strip()
secret = getpass.getpass("TELEGRAM_WEBHOOK_SECRET (must match Supabase Function Secret; hidden): ").strip()

if not bot or ":" not in bot:
    raise SystemExit("RESULT=FAIL stage=preflight reason=invalid_bot_token_format")
if len(secret) < 32 or len(secret) > 256 or not re.fullmatch(r"[A-Za-z0-9_-]+", secret):
    raise SystemExit("RESULT=FAIL stage=preflight reason=secret_must_be_32_to_256_telegram_supported_characters")

def api(method, payload=None):
    url = "https://api.telegram.org/bot" + bot + "/" + method
    body = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Never print exception text: it may contain a URL embedding the bot token.
        raise RuntimeError("telegram_http_" + str(exc.code)) from None
    except Exception:
        raise RuntimeError("telegram_transport_error") from None
    if not isinstance(result, dict) or result.get("ok") is not True:
        code = result.get("error_code", "unknown") if isinstance(result, dict) else "unknown"
        raise RuntimeError("telegram_api_error_" + str(code))
    return result.get("result")

try:
    api("setWebhook", {
        "url": HOOK_URL,
        "secret_token": secret,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": False,
    })
    info = api("getWebhookInfo")
    if not isinstance(info, dict) or info.get("url") != HOOK_URL:
        raise RuntimeError("webhook_url_verification_failed")
    print("RESULT=PASS stage=telegram_webhook_registration url_match=true pending_updates=" + str(int(info.get("pending_update_count", 0))))
except RuntimeError as exc:
    raise SystemExit("RESULT=FAIL stage=telegram_webhook_registration reason=" + str(exc)) from None
PY
