# RAFIQ — Meta WhatsApp Cloud API

## Architecture

`Meta WhatsApp Cloud API → RAFIQ webhook → RAFIQ agent → human approval → Meta WhatsApp Cloud API`

No third-party WhatsApp gateway is required.

## Required server-side secrets

- `META_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `WHATSAPP_INTERNAL_SEND_SECRET`
- `WHATSAPP_SENDING_ENABLED=false` until the first controlled test is explicitly enabled.

These values must never be committed to Git, HTML, browser JavaScript, screenshots, chat messages, or public documentation.

## Webhook

Callback URL:

`https://<RAFIQ-DOMAIN>/api/whatsapp/webhook`

Verification uses `hub.verify_token` and the server-side `META_VERIFY_TOKEN`.

Incoming POST requests are authenticated with `X-Hub-Signature-256` using the server-side `META_APP_SECRET`.

## Outbound policy

The platform must not send an external WhatsApp message unless:

1. The message is generated from a controlled workflow.
2. Human approval is recorded for the message.
3. `WHATSAPP_SENDING_ENABLED=true` is intentionally enabled for the environment.
4. The Meta access token and phone number ID are available only server-side.
5. The recipient is supplied at runtime and is not persisted as a test fixture.

## First test

The first recipient remains a transient test destination and must not be stored in the repository, database seed, documentation, or source code.

Suggested first message:

`مرحبًا، معك رفيق. كيف يمكننا مساعدتك والتعريف بخدمات الرعاية المنزلية المتاحة؟`

The message should be sent only after the operator confirms the exact draft in the admin workflow.

## Meta dashboard checklist

- Business Portfolio: existing `issaapplication`
- Existing WhatsApp Business Account: keep the current account
- Existing business phone number: keep the current number
- Cloud API enabled
- Webhook callback URL configured
- Verify token configured
- App secret available to the server only
- Access token available to the server only
- Required WhatsApp permissions granted to the Meta app
- Test recipient available in Meta's allowed/test environment where applicable

## Safety

- Never use WhatsApp Web automation for the production platform.
- Never place Meta tokens in frontend code.
- Never log message bodies, access tokens, or phone numbers unnecessarily.
- AI may analyze and draft; it does not independently approve contractual, financial, medical, or external actions.
