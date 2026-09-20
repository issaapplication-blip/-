const KAPSO_BASE_URL = process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp";

export const kapsoConfigured = () =>
  Boolean(process.env.KAPSO_API_KEY && process.env.KAPSO_PHONE_NUMBER_ID);

export async function kapsoSendText(to: string, body: string) {
  if (!kapsoConfigured()) throw new Error("Kapso configuration is incomplete");
  const response = await fetch(`${KAPSO_BASE_URL}/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KAPSO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Kapso WhatsApp API error (${response.status})`);
  return result;
}
