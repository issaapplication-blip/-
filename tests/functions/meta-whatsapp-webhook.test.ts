import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"),
  "utf8",
);

test("Meta WhatsApp webhook asks Meta to retry when inbound persistence fails", () => {
  expect(source).toContain('if (insert.error.code === "23505") continue;');
  expect(source).toContain('return new Response("Temporary persistence failure", {');
  expect(source).toContain('status: 503,');
  expect(source).toContain('"Retry-After": "5"');
});

test("Meta WhatsApp webhook does not expose database error details in logs", () => {
  expect(source).toContain('JSON.stringify({ code: insert.error.code || "unknown" })');
  expect(source).not.toContain('console.error("inbound insert failed", insert.error.message)');
});

test("Meta WhatsApp automatic replies remain disabled by default", () => {
  expect(source).toContain("const WHATSAPP_AUTOREPLY_ENABLED = false;");
});
