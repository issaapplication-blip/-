const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp/v24.0";

export const kapsoConfigured = () =>
  Boolean(process.env.KAPSO_API_KEY && (process.env.KAPSO_PHONE_NUMBER_ID ?? "1324609540731383"));

export async function kapsoSendText({to:destination: {to?: string; recipient?: string}}, body: string) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID ?? "1324609540731383";
  if (!destination.to && !destination.recipient) throw new Error("Kapso recipient is missing");
  const response = await fetch(`${KAPSO_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...(destination.to ? {recipient_type: "individual", to: destination.to} : {recipient: destination.recipient}),
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Kapso WhatsApp API error (${response.status})`);
  return result;
}
