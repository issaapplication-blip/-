const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp/v24.0";
// RAFIQ Meta/Kapso identity: WABA 1571101954509141, phone number ID 1324609540731383.
// WABA ID is an account ID, not a Meta App ID; Kapso message API routes by phone number ID.
const KAPSO_WABA_ID = process.env.KAPSO_WABA_ID ?? "1571101954509141";
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID ?? "1324609540731383";
const kapsoKey = () => process.env["KAPSO_" + "API_KEY"];
const kapsoPhoneNumberId = () => KAPSO_PHONE_NUMBER_ID;

export const kapsoConfigured = () =>
  Boolean(kapsoKey() && KAPSO_WABA_ID && kapsoPhoneNumberId());

export const kapsoConnectionInfo = () => ({
  wabaId: KAPSO_WABA_ID,
  phoneNumberId: KAPSO_PHONE_NUMBER_ID,
  baseUrl: KAPSO_BASE_URL,
});

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
      signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
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
