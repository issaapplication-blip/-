# RAFIQ | رفيق — Python Telegram booking bot

This is an optional Python implementation for service-request intake. It writes to the existing Supabase project and sends booking alerts to a Telegram admin group/channel. It does not give medical advice and does not automatically send WhatsApp messages; the WhatsApp button opens a prefilled draft for the user to review and send.

## Important: avoid taking over the existing bot by accident

The main repository already contains a TypeScript Telegram webhook integration. Telegram does not allow a single bot token to use webhook delivery and long polling simultaneously. **Do not run this polling bot with the existing `@RAFIQ_Care_Bot` token while its webhook is active.** For a safe test, create a separate test bot with BotFather and use its token. To switch the production bot later, first verify the current webhook and deliberately plan the cutover; do not delete the existing webhook as an untested step.

## 1. Prepare the database

Review and apply `supabase/migrations/20261026230000_telegram_bookings.sql` to the existing project `qmuxaehrahfsnabyjens`. This creates only the new `public.bookings` table and leaves existing tables unchanged. Verify the table exists before running the bot.

## 2. Configure the bot

Use Python 3.11 or newer.

```bash
cd python-bot
python -m venv .venv
```

Activate the environment:
- Windows: `.venv\\Scripts\\activate`
- macOS/Linux: `source .venv/bin/activate`

Install dependencies and create local configuration:

```bash
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and replace all placeholders. Set `TELEGRAM_ADMIN_CHAT_ID` to the numeric ID of the group/channel where the bot has permission to post. Set the WhatsApp number in international digits only, without `+` or spaces.

**Security:** `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret. Never put it in frontend code, a public repository, screenshots, or messages. Keep `.env` out of Git.

## 3. Run

```bash
python rafiq_bot.py
```

Open the test bot and send `/start`. Submit a test booking using non-sensitive sample data and confirm:
1. A row appears in `public.bookings`.
2. The configured Telegram admin destination receives a booking notice.
3. The WhatsApp button opens a prefilled draft; it does not send automatically.

## Runtime

Polling only works while this Python process and its internet connection remain active. Closing the terminal/device stops new intake. A GitHub commit alone does not run the bot. Use a continuously running, trusted runtime for production and store secrets in its secret manager.

## Data minimization

Collect only name, city/area, service type, and Telegram identity for coordination. Do not request diagnoses, medical reports, or emergency details in the bot. The platform is not an emergency service.
