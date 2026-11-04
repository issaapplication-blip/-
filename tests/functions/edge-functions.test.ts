import { describe, expect, test } from "bun:test";
import { loadFunction } from "./harness";

const BASE = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc-test-key-0000000000000000" };
const post = (body: any, headers: Record<string, string> = {}) =>
  new Request("https://f.invalid/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("rafiq-agent caller isolation", () => {
  test("public anon caller cannot choose WhatsApp channel, phone, or meta conversation id", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    const res = await f.handler(post({ message: "مرحبا", channel: "whatsapp", conversation_id: "meta:+96100000000", phone: "+96100000000" }, { authorization: "Bearer anon-public-key" }));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.conversation_id).not.toContain("meta:");
    const upsert = f.calls.find(c => c.op === "upsert")!;
    expect(upsert.args[0].channel).toBe("web");
    expect(upsert.args[0].customer_phone).toBeNull();
    expect(f.calls.some(c => c.filters.some(([, value]) => String(value).includes("meta:")))).toBe(false);
  });
  test("service-role caller may use the WhatsApp conversation id", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    await f.handler(post({ message: "مرحبا", channel: "whatsapp", conversation_id: "meta:+96100000000", phone: "+96100000000" }, { authorization: "Bearer " + BASE.SUPABASE_SERVICE_ROLE_KEY }));
    const upsert = f.calls.find(c => c.op === "upsert")!;
    expect(upsert.args[0].channel).toBe("whatsapp");
    expect(upsert.args[0].external_conversation_id).toBe("meta:+96100000000");
    expect(upsert.args[0].customer_phone).toBe("+96100000000");
  });
  test("public web caller can retain a UUID session but cannot choose a private channel", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    const sessionId = "8f2a1c44-1c72-4f95-8a65-9a8e3d91b0a1";
    await f.handler(post({ message: "مرحبا", channel: "telegram", conversation_id: sessionId, phone: "+96100000000" }, { authorization: "Bearer anon-public-key" }));
    const upsert = f.calls.find(c => c.op === "upsert")!;
    expect(upsert.args[0].channel).toBe("web");
    expect(upsert.args[0].external_conversation_id).toBe(sessionId);
    expect(upsert.args[0].customer_phone).toBeNull();
  });
  test("wrong service key is treated as public", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    await f.handler(post({ message: "مرحبا", channel: "whatsapp", conversation_id: "meta:1" }, { authorization: "Bearer " + BASE.SUPABASE_SERVICE_ROLE_KEY + "x" }));
    expect(f.calls.find(c => c.op === "upsert")!.args[0].channel).toBe("web");
  });
  test("paid provider credentials are ignored and missing Cloudflare credentials use guided fallback", async () => {
    let calls = 0;
    const f = loadFunction("rafiq-agent", {
      ...BASE,
      OPENAI_API_KEY: "must-not-be-used",
      GEMINI_API_KEY: "must-not-be-used",
      RAFIQ_AGENT_PROVIDER: "openai",
      RAFIQ_AGENT_MODEL: "paid-model",
    }, async () => { calls++; throw new Error("no provider call expected without Cloudflare credentials"); });
    const body: any = await (await f.handler(post({ message: "كم السعر؟" }))).json();
    expect(calls).toBe(0);
    expect(body.mode).toBe("guided");
    expect(body.reply).toContain("التكلفة");
  });
  test("configured Cloudflare Workers AI model receives the RAFIQ system identity", async () => {
    let sent: any;
    let requestedUrl = "";
    const f = loadFunction("rafiq-agent", {
      ...BASE,
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "test-token",
      CLOUDFLARE_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    }, async (url, init) => {
      requestedUrl = String(url);
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ success: true, result: { response: "رد تجريبي" } }) };
    });
    const body: any = await (await f.handler(post({ message: "مرحبا" }))).json();
    expect(requestedUrl).toContain("/accounts/test-account/ai/run/@cf%2Fmeta%2Fllama-3.1-8b-instruct");
    expect(sent.messages[0].content).toContain("رفيق | RAFIQ — رعاية منزلية آمنة لكبار السن والمرضى في لبنان.");
    expect(sent.messages[0].content).toContain("@RAFIQ_Care_Bot");
    expect(sent.messages[0].content).toContain("https://t.me/RAFIQ_Care_Bot");
    expect(body.mode).toBe("cloudflare_workers_ai");
    expect(body.reply).toBe("رد تجريبي");
  });
  test("agent redacts customer phone numbers and email addresses before AI calls", async () => {
    let sent: any;
    const f = loadFunction("rafiq-agent", {
      ...BASE,
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "test-token",
    }, async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ success: true, result: { response: "تم" } }) };
    });
    await f.handler(post({ message: "اتصل بي +961 81 506 299 أو mail@example.com" }));
    const userMessage = sent.messages[sent.messages.length - 1].content;
    expect(userMessage).not.toContain("81 506 299");
    expect(userMessage).not.toContain("mail@example.com");
    expect(userMessage).toContain("[رقم محجوب]");
    expect(userMessage).toContain("[بريد محجوب]");
  });
  test("emergency wording creates an escalation record", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    const body: any = await (await f.handler(post({ message: "عندي طوارئ" }))).json();
    expect(body.escalated).toBe(true);
    expect(body.reply).toContain("حالة طارئة");
    expect(f.calls.some(c => c.table === "whatsapp_pending_approvals" && c.op === "insert")).toBe(true);
  });
  test("trusted Telegram privacy_safe_only forces guided mode without provider calls", async () => {
    let providerCalls = 0;
    const f = loadFunction("rafiq-agent", {
      ...BASE, OPENAI_API_KEY: "test-key", RAFIQ_AGENT_MODEL: "test-model", RAFIQ_AGENT_PROVIDER: "openai",
    }, async () => { providerCalls++; throw new Error("provider must not be called in privacy-safe mode"); });
    const body: any = await (await f.handler(post({
      message: "سؤال غير معروف", channel: "telegram", conversation_id: "telegram:test-chat", privacy_safe_only: true,
    }, { authorization: "Bearer " + BASE.SUPABASE_SERVICE_ROLE_KEY }))).json();
    expect(providerCalls).toBe(0);
    expect(body.mode).toBe("guided");
  });
});

describe("public intake CORS origin allowlist", () => {
  for (const functionName of ["public-application-intake", "public-application-upload"]) {
    test(`${functionName} permits only the configured Pages origin and known GitHub Pages origin`, async () => {
      const f = loadFunction(functionName, { ...BASE, RAFIQ_PUBLIC_SITE_URL: "https://rafiq-new.pages.dev/" }, async () => { throw new Error("no network expected"); });
      const accepted = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://rafiq-new.pages.dev", "Access-Control-Request-Method": "POST" } }));
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get("Access-Control-Allow-Origin")).toBe("https://rafiq-new.pages.dev");
      const known = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://issaapplication-blip.github.io", "Access-Control-Request-Method": "POST" } }));
      expect(known.headers.get("Access-Control-Allow-Origin")).toBe("https://issaapplication-blip.github.io");
      const retired = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://rafiq-o6qd.onrender.com", "Access-Control-Request-Method": "POST" } }));
      expect(retired.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const unconfigured = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "POST" } }));
      expect(unconfigured.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  }
});
