import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
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
  test("wrong service key is treated as public", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    await f.handler(post({ message: "مرحبا", channel: "whatsapp", conversation_id: "meta:1" }, { authorization: "Bearer " + BASE.SUPABASE_SERVICE_ROLE_KEY + "x" }));
    expect(f.calls.find(c => c.op === "upsert")!.args[0].channel).toBe("web");
  });
  test("no model configured uses guided fallback without provider calls", async () => {
    let calls = 0;
    const f = loadFunction("rafiq-agent", { ...BASE, OPENAI_API_KEY: "test-key" }, async () => { calls++; throw new Error("provider should not be called without model"); });
    const body: any = await (await f.handler(post({ message: "كم السعر؟" }))).json();
    expect(calls).toBe(0);
    expect(body.mode).toBe("guided");
    expect(body.reply).toContain("السعر النهائي");
  });
  test("configured model is sent to provider", async () => {
    let sent: any;
    const f = loadFunction("rafiq-agent", { ...BASE, OPENAI_API_KEY: "test-key", RAFIQ_AGENT_MODEL: "test-model", RAFIQ_AGENT_PROVIDER: "openai" }, async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output_text: "رد تجريبي" }) };
    });
    await f.handler(post({ message: "مرحبا" }));
    expect(sent.model).toBe("test-model");
  });
  test("emergency wording creates an escalation record", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    const body: any = await (await f.handler(post({ message: "عندي طوارئ" }))).json();
    expect(body.escalated).toBe(true);
    expect(f.calls.some(c => c.table === "whatsapp_pending_approvals" && c.op === "insert")).toBe(true);
  });
});

describe("meta-whatsapp-webhook remains manual-only", () => {
  const SECRET = "app-secret-test";
  const sign = (body: string) => "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
  const env = { ...BASE, META_APP_SECRET: SECRET, META_VERIFY_TOKEN: "verify-test", META_ACCESS_TOKEN: "meta-test", META_PHONE_NUMBER_ID: "1" };
  const event = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: "wamid.test", from: "96100000000", type: "text", text: { body: "مرحبا" } }] } }] }] };

  test("valid signed inbound is stored without calling agent or sending outbound", async () => {
    const urls: string[] = [];
    const f = loadFunction("meta-whatsapp-webhook", env, async (url) => { urls.push(url); return { ok: true, json: async () => ({}) }; });
    const raw = JSON.stringify(event);
    const res = await f.handler(new Request("https://f.invalid/", { method: "POST", headers: { "x-hub-signature-256": sign(raw) }, body: raw }));
    expect(res.status).toBe(200);
    expect(urls).toEqual([]);
    expect(f.calls.some(c => c.table === "whatsapp_inbound_events" && c.op === "insert")).toBe(true);
    expect(f.calls.some(c => c.table === "whatsapp_outbound_messages")).toBe(false);
  });
  test("missing or invalid signature is rejected", async () => {
    const f = loadFunction("meta-whatsapp-webhook", env, async () => { throw new Error("no network expected"); });
    const raw = JSON.stringify(event);
    expect((await f.handler(new Request("https://f.invalid/", { method: "POST", body: raw }))).status).toBe(401);
    expect((await f.handler(new Request("https://f.invalid/", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: raw }))).status).toBe(401);
    expect(f.calls.length).toBe(0);
  });
});
