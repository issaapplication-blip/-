import { expect, test } from "bun:test";
import { loadFunction } from "./harness";

const BASE = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "svc-test-key-0000000000000000",
  META_VERIFY_TOKEN: "synthetic-meta-verify-token",
  META_APP_SECRET: "synthetic-meta-app-secret",
};
const OWNER_ENV = {
  ...BASE,
  TELEGRAM_BOT_TOKEN: "123456:synthetic-bot-token",
  TELEGRAM_OWNER_CHAT_ID: "1001",
};

async function sign(body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(BASE.META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function webhook(body: string, signature: string) {
  return new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  });
}

test("Meta verification accepts only the exact configured token", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const valid = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=synthetic-meta-verify-token&hub.challenge=synthetic-challenge"));
  expect(valid.status).toBe(200);
  expect(await valid.text()).toBe("synthetic-challenge");
  const invalid = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=synthetic-challenge"));
  expect(invalid.status).toBe(403);
});

test("Meta webhook rejects oversized declared and streamed bodies", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const declared = await f.handler(new Request("https://f.invalid/", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "512001" }, body: "{}",
  }));
  expect(declared.status).toBe(413);
  const streamed = await f.handler(new Request("https://f.invalid/", {
    method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(512001),
  }));
  expect(streamed.status).toBe(413);
});

test("WhatsApp requires a valid Meta HMAC signature", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const response = await f.handler(webhook(JSON.stringify({ object: "whatsapp_business_account", entry: [] }), "sha256=invalid"));
  expect(response.status).toBe(401);
});

test("WhatsApp text is relayed to every owner Telegram chat and never to the agent or WhatsApp API", async () => {
  const urls: string[] = [];
  const sent: any[] = [];
  const f = loadFunction("meta-whatsapp-webhook", OWNER_ENV, async (url: string, init?: any) => {
    urls.push(url);
    if (url.startsWith("https://api.telegram.org/bot123456:synthetic-bot-token/sendMessage")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error("unexpected provider request");
  });
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: "96170000000", profile: { name: "Synthetic Sender" } }],
      messages: [{ id: "wamid.SYNTH1", from: "96170000000", type: "text", text: { body: "مرحباً، أريد رعاية منزلية" } }],
    } }] }],
  });
  const response = await f.handler(webhook(body, await sign(body)));
  expect(response.status).toBe(200);
  expect(sent.map(x => x.chat_id)).toEqual(["1001"]);
  expect(sent[0].text).toContain("مرحباً، أريد رعاية منزلية");
  expect(sent[0].text).toContain("Synthetic Sender");
  expect(sent[0].reply_markup.inline_keyboard[0][0].url).toBe("https://wa.me/96170000000");
  expect(urls.some(x => x.includes("rafiq-agent") || x.includes("graph.facebook.com"))).toBe(false);
  const update = f.calls.find(x => x.table === "whatsapp_inbound_events" && x.op === "update");
  expect(update?.args[0].processing_status).toBe("forwarded_to_owner");
});

test("WhatsApp media and location are relayed with metadata for the owner to inspect in WhatsApp", async () => {
  const sent: any[] = [];
  const f = loadFunction("meta-whatsapp-webhook", OWNER_ENV, async (_url: string, init?: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [
      { id: "wamid.SYNTH2", from: "96170000000", type: "image", image: { id: "media-image-1", caption: "صورة تقرير تجريبي" } },
      { id: "wamid.SYNTH3", from: "96170000000", type: "document", document: { id: "media-doc-1", filename: "sample.pdf" } },
      { id: "wamid.SYNTH4", from: "96170000000", type: "location", location: { latitude: 33.9, longitude: 35.5 } },
      { id: "wamid.SYNTH5", from: "96170000000", type: "interactive", interactive: { button_reply: { title: "طلب رعاية" } } },
    ] } }] }],
  });
  const response = await f.handler(webhook(body, await sign(body)));
  expect(response.status).toBe(200);
  expect(sent).toHaveLength(4);
  expect(sent.some(x => x.text.includes("صورة تقرير تجريبي") && x.text.includes("media-image-1"))).toBe(true);
  expect(sent.some(x => x.text.includes("sample.pdf") && x.text.includes("media-doc-1"))).toBe(true);
  expect(sent.some(x => x.text.includes("Location: 33.9, 35.5"))).toBe(true);
  expect(sent.some(x => x.text.includes("طلب رعاية"))).toBe(true);
});

test("Failed owner Telegram relay is recorded as failed and never replies to WhatsApp", async () => {
  const f = loadFunction("meta-whatsapp-webhook", OWNER_ENV, async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ id: "wamid.SYNTH6", from: "96170000000", type: "text", text: { body: "test" } }] } }] }],
  });
  const response = await f.handler(webhook(body, await sign(body)));
  expect(response.status).toBe(200);
  const update = f.calls.find(x => x.table === "whatsapp_inbound_events" && x.op === "update");
  expect(update?.args[0].processing_status).toBe("failed");
  const source = (await import("node:fs")).readFileSync(
    (await import("node:path")).resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"), "utf8",
  );
  expect(source).not.toContain("rafiq-agent");
  expect(source).not.toContain("graph.facebook.com");
  expect(source).not.toContain("WHATSAPP_AUTOREPLY_ENABLED");
  expect(source).toContain('req.headers.get("x-hub-signature-256")');
  expect(source).toContain("readLimitedBody(req, maxBodyBytes)");
  expect(source).toContain('insert.error.code === "23505"');
});
