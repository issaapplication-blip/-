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
  test("no model configured uses guided fallback without provider calls", async () => {
    let calls = 0;
    const f = loadFunction("rafiq-agent", { ...BASE, OPENAI_API_KEY: "test-key" }, async () => { calls++; throw new Error("provider should not be called without model"); });
    const body: any = await (await f.handler(post({ message: "كم السعر؟" }))).json();
    expect(calls).toBe(0);
    expect(body.mode).toBe("guided");
    expect(body.reply).toContain("التكلفة");
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
    expect(body.reply).toContain("حالة طارئة");
    expect(f.calls.some(c => c.table === "whatsapp_pending_approvals" && c.op === "insert")).toBe(true);
  });
});
