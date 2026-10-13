#!/usr/bin/env bash
set -Eeuo pipefail
: "$RAFIQ_TEST_BASE_URL"; : "$TELEGRAM_WEBHOOK_SECRET"
if [[ -z "$RAFIQ_TEST_BASE_URL" || -z "$TELEGRAM_WEBHOOK_SECRET" ]]; then echo "Set staging URL and staging webhook secret privately." >&2; exit 2; fi
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }
BASE=$(printf '%s' "$RAFIQ_TEST_BASE_URL" | sed 's:/*$::'); TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT INT TERM
echo "Checking invalid webhook secret rejection on staging ..."
CODE=$(curl -sS -o "$TMP" -w '%{http_code}' -X POST "$BASE/api/telegram/webhook" -H 'Content-Type: application/json' -H 'X-Telegram-Bot-Api-Secret-Token: definitely-wrong-test-secret' --data '{}')
if [[ "$CODE" != "401" ]]; then echo "FAIL: expected HTTP 401, received $CODE; response: $(head -c 300 "$TMP")" >&2; exit 1; fi
echo "PASS: invalid secret returned HTTP 401."
echo "This smoke test does not test duplicate/concurrent updates, rate limits, restart recovery or real Telegram replies."
