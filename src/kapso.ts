// WhatsApp automation was retired. Keep safe stubs so legacy backend routes fail closed.
export const kapsoConfigured = () => false;
export const kapsoWebhookSecret = () => null;
export async function kapsoSendText(): Promise<never> {
  throw new Error("whatsapp_automation_retired");
}
