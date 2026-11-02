import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFunction } from "./harness";

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

test("Telegram uses the shared offline knowledge base and does not call an external AI provider", () => {
  expect(source).toContain('import { answerFromKnowledge } from "../_shared/rafiq-knowledge.ts"');
  expect(source).toContain("return answerFromKnowledge(text).reply");
  expect(source).not.toContain("api.cloudflare.com/client/v4/accounts/");
  expect(source).not.toContain("api.openai.com");
  expect(source).not.toContain("generativelanguage.googleapis.com");
});

test("Telegram manager chat IDs are required and validated as numeric chat IDs", () => {
  expect(source).toContain("MANAGER_CHAT_IDS.length === 0");
  expect(source).toContain("MANAGER_CHAT_IDS_INVALID");
  expect(source).toContain("/^-?\\d+$/");
});

test("webhook registration script configures and verifies message and callback_query updates", () => {
  const script = readFileSync(resolve(import.meta.dir, "../../ops/register-telegram-webhook.sh"), "utf8");
  expect(script).toContain('"allowed_updates": ["message", "callback_query"]');
  expect(script).toContain('required = {"message", "callback_query"}');
  expect(script).toContain("webhook_allowed_updates_verification_failed");
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

test("Telegram webhook clears the processing lease when it marks an update finished", () => {
  const mark = source.slice(source.indexOf("async function markUpdate"), source.indexOf("Deno.serve"));
  expect(mark).toContain("lease_until: null");
});

test("a Telegram update is processed once and a completed duplicate is rejected without a second send", async () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    TELEGRAM_BOT_TOKEN: "123456:test-token",
    TELEGRAM_WEBHOOK_SECRET: "01234567890123456789012345678901",
    TELEGRAM_MANAGER_CHAT_IDS: "-1001234567890",
  };
  const claimed = new Set<number>();
  let telegramSends = 0;
  const f = loadFunction(
    "telegram-webhook",
    env,
    async () => {
      telegramSends++;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    (name, args) => {
      if (name !== "claim_telegram_update") return { data: null, error: null };
      const id = Number(args.p_update_id);
      if (claimed.has(id)) return { data: [{ claimed: false, current_status: "completed" }], error: null };
      claimed.add(id);
      return { data: [{ claimed: true, current_status: "processing" }], error: null };
    },
  );
  const update = {
    update_id: 987654321,
    message: {
      chat: { id: 12345, type: "private" },
      from: { id: 12345 },
      text: "/help",
    },
  };
  const request = () => new Request("https://edge.example/telegram-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify(update),
  });

  const first = await f.handler(request());
  const second = await f.handler(request());
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ ok: true, status: "processed" });
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({ ok: true, status: "duplicate_completed" });
  expect(telegramSends).toBe(1);
  expect(f.calls.filter((call) => call.table === "claim_telegram_update")).toHaveLength(2);
});
