import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const backend = readFileSync(resolve(root, "src/index.ts"), "utf8");
const agentPrompt = readFileSync(resolve(root, "src/agent.ts"), "utf8");
const messaging = readFileSync(resolve(root, "src/messaging-service.ts"), "utf8");
const kapso = readFileSync(resolve(root, "src/kapso.ts"), "utf8");
const autoReply = readFileSync(resolve(root, "public/auto-reply.mjs"), "utf8");

function block(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  if (start < 0 || end < 0) throw new Error("source block not found: " + startToken);
  return source.slice(start, end);
}

describe("legacy WhatsApp inbound-only policy — offline source checks", () => {
  test("Meta webhook processing only persists and forwards; it never invokes an agent", () => {
    const core = block(backend, "const processMetaMessageCore=", "const processMetaMessage=");
    expect(core).toContain("recordInboundEvent");
    expect(core).toContain("forwardWhatsAppToTelegramManager");
    expect(core).not.toContain("draftAgentReply");
    expect(core).not.toContain("draftPlatformReply");
    expect(core).not.toContain("draftInboundReply");
    expect(core).not.toContain("rafiqFallback");
    expect(core).not.toContain("sendWhatsAppText");
  });

  test("legacy Kapso webhook routes are retired and cannot invoke an agent or send messages", () => {
    expect(backend).toContain('.post("/api/kapso/webhook",({set})=>{set.status=410;');
    expect(backend).toContain('.post("/api/webhooks/webhook/:webhookId",({set})=>{set.status=410;');
    expect(kapso).not.toContain("fetch(");
    expect(kapso).not.toContain("kapsoSendText");
  });

  test("legacy backend contains no WhatsApp outbound provider implementation", () => {
    expect(backend).not.toContain("graph.facebook.com");
    expect(backend).not.toContain("kapsoSendText(");
    expect(backend).not.toContain("sendWhatsAppText(");
    expect(backend).not.toContain("recordOutboundMessage(");
    expect(backend).not.toContain("whatsapp_outbound_messages");
    expect(messaging).not.toContain("graph.facebook.com");
    expect(messaging).not.toContain("kapsoSendText");
    expect(messaging).not.toContain("metaSendText");
    expect(messaging).not.toContain("channel:\"whatsapp\"");
    expect(kapso).not.toContain("fetch(");
    expect(kapso).not.toContain("kapsoSendText");
  });

  test("legacy polling worker is a no-network retired stub", () => {
    expect(autoReply).toContain("WhatsApp auto-reply worker is retired");
    expect(autoReply).not.toContain("fetch(");
    expect(autoReply).not.toContain("setInterval(");
    expect(autoReply).not.toContain("setTimeout(");
    expect(autoReply).not.toContain("rafiq-agent");
    expect(autoReply).not.toContain("kapso(");
  });

  test("legacy send endpoints are disabled instead of sending through Meta or Kapso", () => {
    expect(backend).toContain('.post("/api/whatsapp/send-text",({set})=>{set.status=410;');
    expect(backend).toContain('.post("/api/kapso/send-text",({set})=>{set.status=410;');
    expect(backend).toContain("WhatsApp replies must be sent manually from the official WhatsApp app");
  });

  test("manager relay is not gated behind an optional auto-forward toggle", () => {
    const relay = block(backend, "const forwardWhatsAppToTelegramManager=", "const TELEGRAM_WELCOME");
    expect(relay).toContain("TELEGRAM_MANAGER_CHAT_IDS");
    expect(relay).toContain("telegramSendText");
    expect(relay).not.toContain("RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING");
  });

  test("website and Telegram use the deterministic local knowledge fallback", () => {
    expect(backend).toContain("const draftPlatformReply = async (message: string, _language?: string) => ({ reply: rafiqFallback(message), model: \"rafiq-knowledge\" });");
    expect(backend).toContain("const result={reply:rafiqFallback(textBody,conversationHistory),model:\"rafiq-knowledge\"};");
  });

  test("agent instructions explicitly prohibit WhatsApp invocation and outbound replies", () => {
    expect(agentPrompt).toContain("The RAFIQ automated agent operates only on the website and Telegram");
    expect(agentPrompt).toContain("Never process, answer, classify, draft a reply to");
    expect(agentPrompt).toContain("The platform must never send an outbound WhatsApp message");
  });
});

test("completion upload failure logs omit applicant-provided filenames", () => {
  const source = readFileSync(resolve(root, "src/index.ts"), "utf8");
  const line = source.split("\\n").find((entry) => entry.includes('event:"rafig_completion_upload_failed"'));
  expect(line).toBeDefined();
  expect(line).not.toContain("safeName");
  expect(line).not.toContain("file:");
});
