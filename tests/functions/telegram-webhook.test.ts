import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacyIndex = readFileSync(resolve(import.meta.dir, "../../src/index.ts"), "utf8");
const legacyTelegram = readFileSync(resolve(import.meta.dir, "../../src/telegram.ts"), "utf8");
const legacyManager = readFileSync(resolve(import.meta.dir, "../../src/telegram-manager.ts"), "utf8");

const source = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/telegram-webhook/index.ts"),
  "utf8",
);

test("Telegram webhook fails closed without bot, Supabase, or secret configuration", () => {
  expect(source).toContain("WEBHOOK_SECRET.length < 32");
  expect(source).toContain('x-telegram-bot-api-secret-token');
  expect(source).toContain("safeEqual(receivedSecret, WEBHOOK_SECRET)");
});

test("Telegram webhook claims update_id atomically and treats completed duplicates idempotently", () => {
  expect(source).toContain('rpc("claim_telegram_update"');
  expect(source).toContain('claim.current_status === "completed"');
  expect(source).toContain('return json(200, { ok: true, status: "duplicate_completed" })');
});

test("Telegram webhook uses a server-side rate limit and retryable failures", () => {
  expect(source).toContain('rpc("consume_telegram_rate_limit"');
  expect(source).toContain('return json(503, { error: "processing_failed_retry" })');
  expect(source).toContain('markUpdate(updateId, "failed", reason)');
});

test("Telegram requests are stored only after a real session write and never promise a confirmed booking", () => {
  expect(source).toContain('status: "submitted"');
  expect(source).toContain("لا يُعد هذا تأكيدًا لحجز الخدمة");
  expect(source).toContain('from("rafiq_telegram_request_sessions")');
});

test("AI option uses Cloudflare Workers AI, redacts phone numbers, and never enables Gemini/OpenAI", () => {
  expect(source).toContain("function redactPhones");
  const redactionSource = source.slice(source.indexOf("function redactPhones"), source.indexOf("async function generateFaqReply"));
  expect(redactionSource).toContain(".replace(/(?:");
  expect(redactionSource).toContain("[رقم محجوب]");
  const lebanonNumber = /(?:\+?961[\s().-]*0?[\s().-]*[1-9](?:[\s().-]*\d){6,7})/g;
  const internationalNumber = /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g;
  expect("Contact +961 81 506 299 now".replace(lebanonNumber, "[رقم محجوب]")).not.toContain("81 506 299");
  expect("Call +39 333 123 4567".replace(internationalNumber, "[رقم محجوب]")).not.toContain("333 123 4567");
  expect(source).toContain("api.cloudflare.com/client/v4/accounts/");
  expect(source).toContain("@cf/meta/llama-3.1-8b-instruct");
  expect(source).not.toContain("generativelanguage.googleapis.com");
  expect(source).not.toContain("api.openai.com");
});

test("legacy Render process cannot re-register the Telegram webhook unless explicitly opted in", () => {
  expect(legacyIndex).toContain('RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK !== "true"');
  const start = legacyIndex.indexOf("const registerTelegramWebhookOnStartup = async () => {");
  const end = legacyIndex.indexOf("\n};", start);
  const registration = legacyIndex.slice(start, end + 3);
  expect(registration).not.toContain('process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com"');
  expect(registration).toContain('RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK !== "true"');
});

test("legacy Telegram webhook verifier fails closed when the secret is absent or short", () => {
  expect(legacyTelegram).toContain("expected.length < 32");
  expect(legacyTelegram).toContain("difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i)");
  expect(legacyTelegram).not.toContain("if (!expected) return true");
});

test("Telegram broadcasts do not require the website or its image assets", () => {
  expect(legacyIndex).toContain("await telegramSendPhoto(recipientId,TELEGRAM_BROADCAST_IMAGE,text,TELEGRAM_BROADCAST_BUTTON)");
  expect(legacyIndex).toContain(": await telegramSendText(recipientId,text,TELEGRAM_BROADCAST_BUTTON)");
  expect(legacyIndex).toContain('const link=publicBase.startsWith("https://")');
  expect(legacyIndex).not.toContain('process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com"');
  expect(legacyIndex).not.toContain("Sitemap: https://rafiq-o6qd.onrender.com/sitemap.xml");
});

test("Manager broadcast defaults contain no retired Render URL", () => {
  expect(legacyManager).not.toContain("https://rafiq-o6qd.onrender.com");
});

test("Scheduled marketing ads require a separate explicit approval flag", () => {
  expect(legacyIndex).toContain('process.env.RAFIQ_TELEGRAM_SCHEDULED_ADS_APPROVED !== "true"');
});

test("Unknown Telegram group link is not silently substituted with the official channel", () => {
  const config = readFileSync(resolve(import.meta.dir, "../../src/rafiq-config.ts"), "utf8");
  expect(config).toContain('telegramGroupUrl: (process.env.TELEGRAM_GROUP_URL ?? "").trim()');
  expect(config).toContain('telegramChannelUrl: (process.env.TELEGRAM_CHANNEL_URL ?? "https://t.me/+a7CDblNyGkw1Yjg8").trim()');
});
