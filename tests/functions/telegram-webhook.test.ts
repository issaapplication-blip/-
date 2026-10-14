import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacyIndex = readFileSync(resolve(import.meta.dir, "../../src/index.ts"), "utf8");
const legacyTelegram = readFileSync(resolve(import.meta.dir, "../../src/telegram.ts"), "utf8");

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
  expect(source).toContain("api.cloudflare.com/client/v4/accounts/");
  expect(source).not.toContain("generativelanguage.googleapis.com");
  expect(source).not.toContain("api.openai.com");
});

test("legacy Render process cannot re-register the Telegram webhook unless explicitly opted in", () => {
  expect(legacyIndex).toContain('RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK !== "true"');
  expect(legacyIndex).not.toContain('process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com"');
});

test("legacy Telegram webhook verifier fails closed when the secret is absent or short", () => {
  expect(legacyTelegram).toContain("expected.length < 32");
  expect(legacyTelegram).toContain("difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i)");
  expect(legacyTelegram).not.toContain("if (!expected) return true");
});
