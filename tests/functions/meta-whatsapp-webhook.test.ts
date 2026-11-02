import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFunction } from "./harness";

const ENV = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  META_VERIFY_TOKEN: "verify-token-test",
  META_APP_SECRET: "meta-app-secret-test",
  TELEGRAM_BOT_TOKEN: "123456:test-telegram-token",
  TELEGRAM_MANAGER_CHAT_IDS: "-1001234567890",
};

async function signature(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ENV.META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("WhatsApp inbound-only Telegram relay — offline", () => {
  test("Meta GET verification returns the challenge only for the configured verify token", async () => {
    const f = loadFunction("meta-whatsapp-webhook", ENV, async () => { throw new Error("network not expected"); });
    const good = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=abc123"));
    expect(good.status).toBe(200);
    expect(await good.text()).toBe("abc123");
    const bad = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123"));
    expect(bad.status).toBe(403);
  });

  test("valid signed WhatsApp text is stored and forwarded to Telegram manager with sender number", async () => {
    const telegramCalls: Array<{ url: string; body: any }> = [];
    const f = loadFunction("meta-whatsapp-webhook", ENV, async (url, init) => {
      telegramCalls.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 44 } }) };
    });
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messages: [{
        id: "wamid.test.001", from: "96181506299", type: "text",
        text: { body: "مرحباً، أريد الاستفسار عن رعاية المسنين" }, timestamp: "1793600000",
      }] } }] }],
    });
    const sig = await signature(body);
    const response = await f.handler(new Request("https://f.invalid/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      body,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, received: 1, forwarded: 1, duplicates: 0, failed: 0 });
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0].url).toContain("api.telegram.org/bot");
    expect(telegramCalls[0].url).toContain("/sendMessage");
    expect(telegramCalls[0].body.chat_id).toBe("-1001234567890");
    expect(telegramCalls[0].body.text).toContain("+96181506299");
    expect(telegramCalls[0].body.text).toContain("أريد الاستفسار عن رعاية المسنين");
    expect(telegramCalls[0].body.text).toContain("لم يتم استدعاء أي وكيل");
    expect(f.calls.some((call) => call.table === "whatsapp_inbound_events" && call.op === "insert")).toBe(true);
    expect(f.calls.some((call) => call.table === "whatsapp_inbound_events" && call.op === "update")).toBe(true);
  });

  test("invalid signature is rejected and does not contact Telegram", async () => {
    let calls = 0;
    const f = loadFunction("meta-whatsapp-webhook", ENV, async () => { calls++; throw new Error("network must not be called"); });
    const response = await f.handler(new Request("https://f.invalid/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    }));
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
  });

  test("WhatsApp webhook contains no agent invocation or Meta outbound API", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"), "utf8");
    expect(source).not.toContain("rafiq-agent");
    expect(source).not.toContain("graph.facebook.com");
    expect(source).not.toContain("whatsapp_outbound_messages");
    expect(source).not.toContain("META_ACCESS_TOKEN");
    expect(source).not.toContain("sendWhatsApp");
  });

  test("database uniqueness and duplicate-conflict handling prevent repeated forwarding", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"), "utf8");
    const migration = readFileSync(resolve(import.meta.dir, "../../supabase/migrations/20260928090843_rafig_agent_whatsapp_runtime.sql"), "utf8");
    expect(source).toContain('insert.error?.code === "23505"');
    expect(migration).toContain("whatsapp_inbound_events_provider_message_uidx");
    expect(migration).toContain("unique index");
  });
});
