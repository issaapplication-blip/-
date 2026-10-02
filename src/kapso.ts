const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp/v24.0";
const kapsoKey = () => process.env["KAPSO_" + "API_KEY"];
const kapsoPhoneNumberId = () => process.env.KAPSO_PHONE_NUMBER_ID ?? "1324609540731383";

export const kapsoConfigured = () =>
  Boolean(kapsoKey() && kapsoPhoneNumberId());

export const kapsoWebhookSecret = () =>
  process.env.KAPSO_WEBHOOK_SECRET ?? null;

const kapsoHeaders = () => ({
  "X-API-Key": kapsoKey()!,
  "Content-Type": "application/json",
});

export async function kapsoSendText(
  destination: string | { to?: string; recipient?: string },
  body: string,
) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const phoneNumberId = kapsoPhoneNumberId();
  const target = typeof destination === "string" ? { to: destination } : destination;
  if (!target.to && !target.recipient) throw new Error("Kapso recipient is missing");

  const response = await fetch(
    KAPSO_BASE_URL + "/" + phoneNumberId + "/messages",
    {
      method: "POST",
      headers: kapsoHeaders(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        ...(target.to
          ? { recipient_type: "individual", to: target.to }
          : { recipient: target.recipient }),
        type: "text",
        text: { preview_url: false, body },
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Kapso WhatsApp API error (" + response.status + ")");
  }
  return result;
}

export async function kapsoSendRecipient(recipient: string, body: string) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const phoneNumberId = kapsoPhoneNumberId();
  if (!recipient) throw new Error("Kapso recipient is missing");

  const response = await fetch(
    KAPSO_BASE_URL + "/" + phoneNumberId + "/messages",
    {
      method: "POST",
      headers: kapsoHeaders(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient,
        type: "text",
        text: { preview_url: false, body },
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Kapso WhatsApp API error (" + response.status + ")");
  }
  return result;
}
