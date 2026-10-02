const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp/v24.0";
const KAPSO_PLATFORM_BASE_URL = "https://api.kapso.ai/platform/v1";
const KAPSO_WEBHOOK_URL =
  process.env.KAPSO_ORCHESTRATOR_WEBHOOK_URL ??
  "https://mhdissa980.app.n8n.cloud/webhook/rafiq-kapso-inbound";
const kapsoKey = () => process.env["KAPSO_" + "API_KEY"];
const kapsoPhoneNumberId = () => process.env.KAPSO_PHONE_NUMBER_ID ?? "1324609540731383";
let runtimeKapsoWebhookSecret: string | null = null;

export const kapsoConfigured = () =>
  Boolean(kapsoKey() && kapsoPhoneNumberId());

export const kapsoWebhookSecret = () =>
  runtimeKapsoWebhookSecret ?? process.env.KAPSO_WEBHOOK_SECRET ?? null;

const kapsoHeaders = () => ({
  "X-API-Key": kapsoKey()!,
  "Content-Type": "application/json",
});

const kapsoPlatformRequest = async (
  path: string,
  init: RequestInit = {},
) => {
  if (!kapsoKey()) throw new Error("Kapso API key is not configured");
  const response = await fetch(KAPSO_PLATFORM_BASE_URL + path, {
    ...init,
    headers: {
      "X-API-Key": kapsoKey()!,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Kapso Platform API error (${response.status})`);
  }
  return result;
};

const configureKapsoWebhook = async (
  phoneNumberId: string,
  webhooks: any[],
) => {
  const desired = webhooks.find(
    (hook) =>
      hook?.kind === "kapso" &&
      hook?.url === KAPSO_WEBHOOK_URL &&
      Array.isArray(hook?.events) &&
      hook.events.includes("whatsapp.message.received"),
  );

  for (const hook of webhooks) {
    const isInboundHook =
      hook?.kind === "kapso" &&
      Array.isArray(hook?.events) &&
      hook.events.includes("whatsapp.message.received");

    if (!isInboundHook) continue;
    if (hook?.url === KAPSO_WEBHOOK_URL) continue;
    if (hook?.active !== true) continue;

    try {
      await kapsoPlatformRequest(
        `/whatsapp/phone_numbers/${phoneNumberId}/webhooks/${hook.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            whatsapp_webhook: {
              active: false,
            },
          }),
        },
      );
      console.warn(JSON.stringify({
        event: "rafig_kapso_duplicate_inbound_webhook_disabled",
        webhookId: String(hook?.id ?? ""),
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "rafig_kapso_duplicate_inbound_webhook_disable_failed",
        webhookId: String(hook?.id ?? ""),
        error: String(error),
      }));
    }
  }

  if (desired) {
    runtimeKapsoWebhookSecret =
      typeof desired.secret_key === "string" && desired.secret_key
        ? desired.secret_key
        : runtimeKapsoWebhookSecret;

    if (desired.active !== true) {
      try {
        await kapsoPlatformRequest(
          `/whatsapp/phone_numbers/${phoneNumberId}/webhooks/${desired.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              whatsapp_webhook: {
                active: true,
                events: ["whatsapp.message.received"],
              },
            }),
          },
        );
      } catch (error) {
        console.error(JSON.stringify({
          event: "rafig_kapso_n8n_webhook_activate_failed",
          error: String(error),
        }));
        return { configured: false, reason: "activate_failed" };
      }
    }

    console.log(JSON.stringify({
      event: "rafig_kapso_n8n_webhook_ready",
      active: true,
      existing: true,
      target: KAPSO_WEBHOOK_URL,
      webhookEvent: "whatsapp.message.received",
    }));
    return { configured: true, existing: true };
  }

  try {
    const created = await kapsoPlatformRequest(
      `/whatsapp/phone_numbers/${phoneNumberId}/webhooks`,
      {
        method: "POST",
        body: JSON.stringify({
          whatsapp_webhook: {
            kind: "kapso",
            url: KAPSO_WEBHOOK_URL,
            events: ["whatsapp.message.received"],
            active: true,
          },
        }),
      },
    );

    runtimeKapsoWebhookSecret =
      typeof created?.data?.secret_key === "string" && created.data.secret_key
        ? created.data.secret_key
        : runtimeKapsoWebhookSecret;

    console.log(JSON.stringify({
      event: "rafig_kapso_n8n_webhook_created",
      active: true,
      existing: false,
      target: KAPSO_WEBHOOK_URL,
      webhookEvent: "whatsapp.message.received",
    }));
    return { configured: true, existing: false };
  } catch (error) {
    console.error(JSON.stringify({
      event: "rafig_kapso_n8n_webhook_create_failed",
      error: String(error),
    }));
    return { configured: false, reason: "create_failed" };
  }
};

export async function ensureKapsoWebhook() {
  if (!kapsoKey()) {
    console.warn(JSON.stringify({
      event: "rafig_kapso_webhook_autoconfig_skipped",
      reason: "KAPSO_API_KEY_missing",
    }));
    return { configured: false, reason: "KAPSO_API_KEY_missing" };
  }

  const phoneNumberId = kapsoPhoneNumberId();
  try {
    const pages = [1];
    const allWebhooks: any[] = [];
    for (const page of pages) {
      const result = await kapsoPlatformRequest(
        `/whatsapp/phone_numbers/${phoneNumberId}/webhooks?per_page=100&page=${page}`,
      );
      const items = Array.isArray(result?.data) ? result.data : [];
      allWebhooks.push(...items);
      break;
    }

    return await configureKapsoWebhook(phoneNumberId, allWebhooks);
  } catch (error) {
    console.error(JSON.stringify({
      event: "rafig_kapso_webhook_autoconfig_failed",
      error: String(error),
    }));
    return { configured: false, reason: "kapso_api_error" };
  }
}

export async function kapsoSendText(destination: string | { to?: string; recipient?: string }, body: string) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const phoneNumberId = kapsoPhoneNumberId();
  const target = typeof destination === "string" ? { to: destination } : destination;
  if (!target.to && !target.recipient) throw new Error("Kapso recipient is missing");
  const response = await fetch(KAPSO_BASE_URL + "/" + phoneNumberId + "/messages", {
    method: "POST",
    headers: kapsoHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...(target.to ? { recipient_type: "individual", to: target.to } : { recipient: target.recipient }),
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Kapso WhatsApp API error (" + response.status + ")");
  return result;
}

export async function kapsoSendRecipient(recipient: string, body: string) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const phoneNumberId = kapsoPhoneNumberId();
  if (!recipient) throw new Error("Kapso recipient is missing");
  const response = await fetch(KAPSO_BASE_URL + "/" + phoneNumberId + "/messages", {
    method: "POST",
    headers: kapsoHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Kapso WhatsApp API error (" + response.status + ")");
  return result;
}
