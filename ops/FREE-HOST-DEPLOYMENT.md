# RAFIQ — free self-host setup

This branch is the full-app deployment candidate. A successful GitHub build does not mean it is already live.

## Before you start

- Sign in to Oracle Cloud and verify that an Always Free eligible VM is available in your home region. Oracle currently lists an Always Free allowance equivalent to 2 OCPU and 12 GB memory for Ampere A1. Provisioning may be unavailable in some regions; do not choose a paid shape as a workaround.
- Install Coolify on that VM using the official documentation. Keep the administration interface protected and expose only the web service through HTTPS.
- Use the `deploy/rafiq-free-host-20261011` branch in Coolify and deploy from its Docker Compose file.

Official links:
- Oracle Always Free: https://cloud.oracle.com/
- Oracle eligibility and limits: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Coolify installation: https://coolify.io/docs/installation

## How this deployment is arranged

- RAFIQ web service listens on container port 3000.
- Ollama runs on the private Compose network. Do not expose its 11434 port publicly.
- The Qwen3 4B model downloads automatically on first start and persists in a Docker volume. Its public registry lists the model at approximately 2.5 GB under Apache License 2.0: https://ollama.com/library/qwen3:4b
- Default AI inference is local. No OpenAI or Gemini model API key is needed.
- WhatsApp sending and automated replies are disabled. Incoming WhatsApp must be forwarded to the manager on Telegram for manual follow-up.

## Private settings

Use Coolify's private environment settings for the existing server credentials and contact-channel configuration. The variable names are shown in docker-compose.yml. Never put actual credentials in GitHub, code, the deployment guide, screenshots, or chat.

Use the existing Supabase project. Do not create a replacement database and do not run migrations as part of the first deployment.

Before enabling Telegram, verify the service has HTTPS, the correct public URL, a healthy status, and the existing manager dashboard can log in. Telegram webhook reassignment is deliberately disabled by default. Only enable it after the new host has been verified.

After that, use the authenticated Meta dashboard to move the WhatsApp webhook to the verified host callback ending in /api/whatsapp/webhook. Keep all outbound WhatsApp settings disabled so the manager can reply manually from WhatsApp.

## Release checklist

1. Wait for Ollama model initialization and the RAFIQ health check.
2. Verify the public site, Supabase-backed forms, and the manager dashboard.
3. Test one synthetic Telegram message only after switching the webhook to the verified HTTPS URL.
4. Test one owner-controlled WhatsApp inbound message and confirm it appears in the manager's Telegram chat and the existing review workflow.
5. Do not announce the agent as live until both channel checks pass.

Oracle's free capacity and account eligibility are not guaranteed. Coolify is free and open source, but the VM is separate infrastructure and may require account verification.