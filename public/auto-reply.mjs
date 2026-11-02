/**
 * RAFIQ WhatsApp auto-reply worker — permanently retired.
 *
 * WhatsApp is inbound-only:
 *   Meta webhook -> Supabase inbound event -> Telegram manager.
 * The manager replies manually from the official WhatsApp application.
 *
 * This compatibility file intentionally performs no polling, network request,
 * agent invocation, or outbound message. Remove its process/service entrypoint
 * from any external host before enabling the Meta inbound relay.
 */
console.warn("[RAFIQ] WhatsApp auto-reply worker is retired; no polling or outbound messages are performed.");
