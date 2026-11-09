import { expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");
const webAgent = read("functions/api/agent/chat.ts");
const legacyTelegram = read("functions/api/telegram/webhook.ts");
const cvAdmin = read("public/admin.html");
const build = read("ops/build-cloudflare-pages.sh");
const admin = read("public/admin.js");
const adminHtml = read("public/admin.html");
const workflow = read(".github/workflows/rafiq-edge-function-tests.yml");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
const sitemap = read("public/sitemap.xml");

test("admin review is limited to CV and Cover Letter and never sends automatic messages", () => {
  expect(cvAdmin).toContain(".eq('application_type','CV + Cover Letter')");
  expect(cvAdmin).not.toContain("send-completion-request");
  expect(cvAdmin).not.toContain("send-approved-welcome");
  expect(cvAdmin).toContain("notification_attempted:false");
});

test("legacy Cloudflare Telegram receiver is disabled and points to the sole Supabase receiver", () => {
  expect(legacyTelegram).toContain("telegram_cloudflare_d1_webhook_retired");
  expect(legacyTelegram).toContain("json(410,");
  expect(legacyTelegram).toContain("supabase/functions/v1/telegram-webhook");
  expect(legacyTelegram).not.toContain("RAFIQ_DB");
  expect(legacyTelegram).not.toContain("telegram_request_sessions");
});

test("legacy web intake assistant is retired", () => {
  expect(webAgent).toContain("status:410");
  expect(webAgent).toContain("Legacy web intake assistant is retired");
  expect(webAgent).not.toContain("function redactPhones");
});


test("Cloudflare build requires an HTTPS Pages origin and excludes the legacy auto-reply poller", () => {
  expect(build).toContain("RAFIQ_PUBLIC_BASE_URL");
  expect(build).toContain('rm -f "$OUT_DIR/auto-reply.mjs"');
  expect(build).toContain("Suspended Render URL remains");
  expect(build).toContain('test -f "$OUT_DIR/caregivers.html"');
  expect(build).not.toContain('test -f "$OUT_DIR/app.html"');
  expect(build).toContain('include":["/api/*"]');
});

test("legacy-host validation scans only the built bundle, not source templates", () => {
  expect(workflow).toContain("grep -RniE 'onrender\\.com|rafiq-o6qd' dist/;");
  expect(workflow).not.toContain("dist/ public/");
});

test("retired public application pages are absent while CV remains in the PWA", () => {
  for (const path of ["public/app.html", "public/member.html", "public/caregiver-registration.html", "public/nurses.html", "public/families.html", "public/physiotherapists.html"]) {
    expect(existsSync(resolve(import.meta.dir, "../../" + path))).toBe(false);
  }
  expect(existsSync(resolve(import.meta.dir, "../../public/caregivers.html"))).toBe(true);
  expect(manifest.shortcuts.some((x: any) => x.url === "/caregivers.html#cv-service")).toBe(true);
  expect(manifest.shortcuts.some((x: any) => String(x.url).includes("app.html"))).toBe(false);
  expect(sitemap).not.toContain("nurses.html");
  expect(sitemap).not.toContain("families.html");
  expect(sitemap).not.toContain("physiotherapists.html");
});

test("admin UI never grants access from an email address alone", () => {
  expect(admin).toContain("dbAdmin===true&&p?.role==='admin'&&p?.status==='active'");
  expect(admin).not.toContain("ownerByEmail");
});

test("admin dashboard requires database authorization and an active admin profile", () => {
  expect(adminHtml).toContain("db.rpc('is_admin')");
  expect(adminHtml).toContain("db.from('profiles').select('id,email,role,status')");
  expect(adminHtml).toContain("profile?.role!=='admin'||profile?.status!=='active'");
});
