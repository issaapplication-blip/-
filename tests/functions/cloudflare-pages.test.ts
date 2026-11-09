import { expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");
const webAgent = read("functions/api/agent/chat.ts");
const legacyTelegram = read("functions/api/telegram/webhook.ts");
const cvAdmin = read("public/admin.html");
const build = read("ops/build-cloudflare-pages.sh");
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
  for (const path of ["public/app.html", "public/member.html", "public/caregiver-registration.html", "public/nurses.html", "public/families.html", "public/physiotherapists.html", "public/dashboard.html", "public/barcode.html", "public/agent.html"]) {
    expect(existsSync(resolve(import.meta.dir, "../../" + path))).toBe(false);
  }
  expect(existsSync(resolve(import.meta.dir, "../../public/caregivers.html"))).toBe(true);
  expect(manifest.shortcuts.some((x: any) => x.url === "/caregivers.html#cv-service")).toBe(true);
  expect(manifest.shortcuts.some((x: any) => String(x.url).includes("app.html"))).toBe(false);
  expect(sitemap).not.toContain("nurses.html");
  expect(sitemap).not.toContain("families.html");
  expect(sitemap).not.toContain("physiotherapists.html");
});

test("legacy general-purpose admin bundle has been removed", () => {
  expect(existsSync(resolve(import.meta.dir, "../../public/admin.js"))).toBe(false);
  expect(adminHtml).toContain("db.rpc('is_admin')");
});

test("public RAFIQ pages keep Telegram and WhatsApp channels outside the platform", () => {
  const home = read("public/index.html");
  const services = read("public/services.html");
  const cv = read("public/caregivers.html");
  const announcements = read("public/announcements.html");
  for (const page of [home, services, cv, announcements]) {
    expect(page).not.toContain("t.me/");
    expect(page).not.toContain("wa.me/");
    expect(page).not.toContain("whatsapp.com");
  }
  expect(home).toContain("/announcements.html");
  expect(announcements).toContain("لا توجد إعلانات معتمدة منشورة حاليًا");
  expect(cv).toContain("public-application-intake");
  expect(cv).toContain("$25");
  expect(cv).toContain("$10");
  expect(cv).toContain("$35");
  expect(cv).toContain("+$20");
});

test("public CV intake enforces the agreed Whish prices and does not accept CV file uploads before payment", () => {
  const intake = read("supabase/functions/public-application-intake/index.ts");
  const upload = read("supabase/functions/public-application-upload/index.ts");
  expect(intake).toContain("SERVICE_PRICES");
  expect(intake).toContain("payload.total_amount=SERVICE_PRICES[servicePackage]+(extraLanguages*20)");
  expect(upload).toContain('const cats=new Set(["payment_proof"])');
  expect(upload).not.toContain('const cats=new Set(["cv","payment_proof"])');
});

test("admin dashboard requires database authorization and an active admin profile", () => {
  expect(adminHtml).toContain("db.rpc('is_admin')");
  expect(adminHtml).toContain("db.from('profiles').select('id,email,role,status')");
  expect(adminHtml).toContain("profile?.role!=='admin'||profile?.status!=='active'");
});
