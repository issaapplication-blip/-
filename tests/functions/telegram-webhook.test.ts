import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacyIndex = readFileSync(resolve(import.meta.dir, "../../src/index.ts"), "utf8");
const legacyTelegram = readFileSync(resolve(import.meta.dir, "../../src/telegram.ts"), "utf8");
const legacyKapso = readFileSync(resolve(import.meta.dir, "../../src/kapso.ts"), "utf8");
const packageJson = readFileSync(resolve(import.meta.dir, "../../package.json"), "utf8");
const metaWebhook = readFileSync(resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"), "utf8");

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

test("Telegram bot exposes only approved medical-directory categories and no application session flow", () => {
  for (const category of ["labs", "imaging", "physio", "equipment_sale", "equipment_rent"]) {
    expect(source).toContain(category);
  }
  expect(source).toContain('command === "/request"');
  expect(source).toContain("تم إيقاف مسار الطلبات والتقديم عبر البوت");
  expect(source).not.toContain('from("rafiq_telegram_request_sessions")');
  expect(source).not.toContain("telegram_request_start_failed");
  expect(source).toContain("لا تُنشر إلا بعد موافقة الإدارة");
});

test("CV and Cover Letter remains a separate Telegram entry, not a centre/provider application", () => {
  expect(source).toContain('command === "/cv"');
  expect(source).toContain('callback_data: "cv:service"');
  expect(source).toContain("CV + Cover Letter");
  expect(source).toContain("لا ترسل ملفات CV أو مستندات شخصية قبل تأكيد الدفع");
  expect(source).toContain("https://wa.me/96181506299");
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

test("Meta and Kapso WhatsApp automation are retired without outbound API capability", () => {
  expect(legacyIndex).not.toContain("graph.facebook.com");
  expect(legacyIndex).not.toContain("api.kapso.ai");
  expect(legacyIndex).toContain("whatsapp_automation_retired");
  expect(legacyKapso).toContain("kapsoConfigured = () => false");
  expect(legacyKapso).toContain("kapso_integration_retired");
  expect(packageJson).not.toContain("@kapso/whatsapp-cloud-api");
  expect(metaWebhook).toContain("status:410");
  expect(metaWebhook).toContain("Meta WhatsApp webhook is retired");
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
