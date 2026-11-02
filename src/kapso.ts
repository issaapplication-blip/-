// Kapso outbound integration is retired for RAFIQ.
// WhatsApp is inbound-only: Meta webhook -> Supabase -> Telegram manager.
// The manager replies manually from the official WhatsApp application.
export const kapsoConfigured = () => false;
export const kapsoConnectionInfo = () => ({ enabled: false, retired: true });
export const kapsoWebhookSecret = () => null;
