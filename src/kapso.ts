const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp/v24.0";
const KAPSO_PLATFORM_BASE_URL = "https://api.kapso.ai/platform/v1";
const KAPSO_WEBHOOK_URL = "https://rafiq-o6qd.onrender.com/api/kapso/webhook";
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
    const result = await kapsoPlatformRequest(
      `/whatsapp/phone_numbers/${phoneNumberId}/webhooks?per_page=100&page=1`,
    );
    const webhooks = Array.isArray(result?.data) ? result.data : [];
    const matching = webhooks.find((hook: any) =>
      hook?.kind === "kapso" &&
      hook?.url === KAPSO_WEBHOOK_URL &&
      Array.isArray(hook?.events) &&
      hook.events.includes("whatsapp.message.received"),
    );

    if (matching) {
      runtimeKapsoWebhookSecret =
        typeof matching.secret_key === "string" && matching.secret_key
          ? matching.secret_key
          : runtimeKapsoWebhookSecret;
      if (matching.active !== true) {
        try {
          await kapsoPlatformRequest(
            `/whatsapp/phone_numbers/${phoneNumberId}/webhooks/${matching.id}`,
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
            event: "rafig_kapso_webhook_autoconfig_activate_failed",
            error: String(error),
          }));
        }
      }
      console.log(JSON.stringify({
        event: "rafig_kapso_webhook_autoconfig_ready",
        active: true,
        existing: true,
        event: "whatsapp.message.received",
      }));
      return { configured: true, existing: true };
    }

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
      event: "rafig_kapso_webhook_autoconfig_created",
      active: true,
      existing: false,
      event: "whatsapp.message.received",
    }));
    return { configured: true, existing: false };
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
