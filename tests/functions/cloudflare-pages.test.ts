import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");
const proxy = read("functions/_lib/public-intake.ts");
const webAgent = read("functions/api/agent/chat.ts");
const build = read("ops/build-cloudflare-pages.sh");
const admin = read("public/admin.js");
const workflow = read(".github/workflows/rafiq-edge-function-tests.yml");

test("Pages intake proxy uses only the legacy anon key and existing Supabase function", () => {
  expect(proxy).toContain("SUPABASE_ANON_KEY");
  expect(proxy).toContain("/functions/v1/public-intake");
  expect(proxy).toContain("18 * 1024 * 1024");
  expect(proxy).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});

test("web chat redacts phone numbers, avoids AI for emergencies and prices, and has offline fallback", () => {
  expect(webAgent).toContain("function redactPhones");
  expect(webAgent).toContain("@cf/meta/llama-3.1-8b-instruct");
  expect(webAgent).toContain("guided-fallback");
  expect(webAgent).toContain("if (!env.AI || urgent");
  expect(webAgent).not.toContain("api.openai.com");
  expect(webAgent).not.toContain("generativelanguage.googleapis.com");
});

test("Cloudflare build requires an HTTPS Pages origin and excludes the legacy auto-reply poller", () => {
  expect(build).toContain("RAFIQ_PUBLIC_BASE_URL");
  expect(build).toContain('rm -f "$OUT_DIR/auto-reply.mjs"');
  expect(build).toContain("Suspended Render URL remains");
  expect(build).toContain('include":["/api/*"]');
});

test("legacy-host validation scans only the built bundle, not source templates", () => {
  expect(workflow).toContain("grep -RniE 'onrender\\\\.com|rafiq-o6qd' dist/;");
  expect(workflow).not.toContain("dist/ public/");
});

test("admin UI never grants access from an email address alone", () => {
  expect(admin).toContain("dbAdmin===true&&p?.role==='admin'&&p?.status==='active'");
  expect(admin).not.toContain("ownerByEmail");
});
