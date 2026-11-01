import { expect, test } from "bun:test";
import { loadFunction } from "./harness";

const BASE = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "svc-test-key-0000000000000000",
  META_VERIFY_TOKEN: "synthetic-meta-verify-token",
  META_APP_SECRET: "synthetic-meta-app-secret",
};

test("Meta verification accepts only the exact configured token", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const valid = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=synthetic-meta-verify-token&hub.challenge=synthetic-challenge"));
  expect(valid.status).toBe(200);
  expect(await valid.text()).toBe("synthetic-challenge");
  const invalid = await f.handler(new Request("https://f.invalid/?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=synthetic-challenge"));
  expect(invalid.status).toBe(403);
});

test("Meta webhook checks declared and encoded body size before signature verification", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "512001" },
    body: "{}",
  }));
  expect(response.status).toBe(413);
});

test("Meta webhook rejects oversized streamed bodies even without Content-Length", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(512001),
  }));
  expect(response.status).toBe(413);
});

test("WhatsApp automatic replies remain disabled and HMAC signature verification is mandatory", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => { throw new Error("network must not be used"); });
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalid" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
  }));
  expect(response.status).toBe(401);
  // Verify source-level invariant too: no provider response can turn replies on by default.
  const source = (await import("node:fs")).readFileSync(
    (await import("node:path")).resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"),
    "utf8",
  );
  expect(source).toContain("const WHATSAPP_AUTOREPLY_ENABLED = false");
  expect(source).not.toContain('"Access-Control-Allow-Origin": "*"');
  expect(source).toContain('req.headers.get("x-hub-signature-256")');
  expect(source).toContain("readLimitedBody(req, maxBodyBytes)");
  expect(source).toContain('insert.error.code === "23505"');
});


test("Meta webhook records image, document, location and interactive metadata and updates delivery receipts", async () => {
  const f = loadFunction("meta-whatsapp-webhook", BASE, async () => {
    throw new Error("network must not be used while WhatsApp auto replies are disabled");
  });
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [
            { id: "wamid.image.synthetic", from: "961700000001", type: "image", image: { id: "media-image-1", caption: "صورة تقرير تجريبي" } },
            { id: "wamid.document.synthetic", from: "961700000002", type: "document", document: { id: "media-doc-1", filename: "sample.pdf" } },
            { id: "wamid.location.synthetic", from: "961700000003", type: "location", location: { latitude: 33.9, longitude: 35.5 } },
            { id: "wamid.interactive.synthetic", from: "961700000004", type: "interactive", interactive: { button_reply: { title: "طلب رعاية" } } }
          ],
          statuses: [{ id: "wamid.outbound.synthetic", status: "delivered", recipient_id: "961700000005" }]
        }
      }]
    }]
  };
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(BASE.META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const signature = "sha256=" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  }));
  expect(response.status).toBe(200);
  const inbound = f.calls.filter(x => x.table === "whatsapp_inbound_events" && x.op === "insert");
  expect(inbound).toHaveLength(4);
  const inserted = inbound.map(x => x.args[0]);
  expect(inserted.some(x => x.message_type === "image" && x.text_body === "صورة تقرير تجريبي")).toBe(true);
  expect(inserted.some(x => x.message_type === "document" && x.text_body === "Document: sample.pdf")).toBe(true);
  expect(inserted.some(x => x.message_type === "location" && x.text_body?.startsWith("Location: "))).toBe(true);
  expect(inserted.some(x => x.message_type === "interactive" && x.text_body === "طلب رعاية")).toBe(true);
  expect(f.calls.some(x => x.table === "whatsapp_outbound_messages" && x.op === "update" && x.args[0]?.status === "delivered")).toBe(true);
});
