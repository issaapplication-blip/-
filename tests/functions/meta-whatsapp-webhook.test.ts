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
