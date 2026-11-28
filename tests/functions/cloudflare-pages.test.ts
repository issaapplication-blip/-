import { expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");
const webAgent = read("functions/api/agent/chat.ts");
const legacyTelegram = read("functions/api/telegram/webhook.ts");
const cvAdmin = read("public/admin.html");
const legacyDashboard = read("public/dashboard.html");
const build = read("ops/build-cloudflare-pages.sh");
const admin = read("public/admin.js");
const adminHtml = read("public/admin.html");
const backend = read("src/index.ts");
const adminMigration = read("supabase/migrations/20261120110000_require_active_admin_profile.sql");
const workflow = read(".github/workflows/rafiq-edge-function-tests.yml");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
const sitemap = read("public/sitemap.xml");
const mapPage = read("public/map.html");
const homepage = read("public/index.html");
const serviceWorker = read("public/sw.js");
const publicIntakeFunction = read("supabase/functions/public-application-intake/index.ts");
const publicUploadFunction = read("supabase/functions/public-application-upload/index.ts");


test("public CV intake and file upload CORS allow the official Pages origin and reject the retired Render origin", () => {
  for (const source of [publicIntakeFunction, publicUploadFunction]) {
    expect(source).toContain('"https://rafiq-lebanon.pages.dev"');
    expect(source).toContain('origin !== "https://rafiq-o6qd.onrender.com"');
    expect(source).toContain("allowedOrigins.has(origin)");
    expect(source).not.toContain('"https://rafiq-o6qd.onrender.com",\\"https://issaapplication-blip.github.io\\"');
  }
});

test("interactive Lebanon map is linked from the homepage, included in the Pages bundle, and cached by the PWA", () => {
  expect(homepage).toContain('href="/map.html"');
  expect(build).toContain('test -f "$OUT_DIR/map.html"');
  expect(mapPage).toContain('https://www.openstreetmap.org/export/embed.html');
  expect(mapPage).toContain('title="خريطة تفاعلية للبنان من OpenStreetMap"');
  expect(mapPage).toContain('href="/regions.html"');
  expect(serviceWorker).toContain('"/map.html"');
  expect(serviceWorker).toContain('rafig-v91-20261128');
  expect(serviceWorker).toContain('"/hospitals.html"');
});

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

test("legacy dashboard requires the database admin RPC and an active admin profile", () => {
  expect(legacyDashboard).toContain("db.rpc('is_admin')");
  expect(legacyDashboard).toContain("isAdminFlag!==true");
  expect(legacyDashboard).toContain("p.role!=='admin'||p.status!=='active'");
});


test("backend admin API validates the user, database admin RPC, and active profile", () => {
  expect(backend).toContain('supabaseRest("/auth/v1/user",token');
  expect(backend).toContain('supabaseRest("/rest/v1/rpc/is_admin",token,{method:"POST",body:"{}"})');
  expect(backend).toContain("adminCheck.body!==true");
  expect(backend).toContain('profile?.role!=="admin"||profile?.status!=="active"');
});

 
test("database admin authorization requires a signed-in active admin profile", () => {
  expect(adminMigration).toContain("public.is_admin()");
  expect(adminMigration).toContain("auth.uid()");
  expect(adminMigration).toContain("lower(coalesce(p.role, '')) = 'admin'");
  expect(adminMigration).toContain("lower(coalesce(p.status, '')) = 'active'");
  expect(adminMigration).not.toContain("issaapplication@gmail.com");
});

const currentPublicCopyKeys = [
  "current.site.title",
  "current.home.intro.title",
  "current.home.intro.description",
  "current.home.whatsapp",
  "current.home.explore",
  "current.home.hero.caption",
  "current.home.hero.alt",
  "current.home.services.title",
  "current.home.services.subtitle",
  "current.home.labs.title",
  "current.home.labs.description",
  "current.home.radiology.title",
  "current.home.radiology.description",
  "current.home.physio.title",
  "current.home.physio.description",
  "current.home.equipment.title",
  "current.home.equipment.description",
  "current.home.cv.title",
  "current.home.cv.subtitle",
  "current.home.cv.bundle",
  "current.home.cv.price.cv",
  "current.home.cv.price.cover",
  "current.home.cv.price.bundle",
  "current.home.footer.slogan",
  "current.home.cv.language",
  "current.home.cv.cta",
  "current.home.how.title",
  "current.home.how.subtitle",
  "current.home.how.categories",
  "current.home.how.categories.description",
  "current.home.how.regions",
  "current.home.how.regions.description",
  "current.home.how.ads",
  "current.home.how.ads.description",
  "current.home.how.cv",
  "current.home.how.cv.description",
  "current.home.ads.title",
  "current.home.ads.description",
  "current.home.ads.contact",
  "current.home.ads.browse",
  "current.home.channels.title",
  "current.home.channels.subtitle",
  "current.home.footer.tagline",
  "current.home.footer.contact",
  "current.home.footer.copyright"
];

test("current RAFIQ homepage copy has non-empty translations in all five supported languages", () => {
  for (const language of ["ar", "en", "fr", "it", "de"]) {
    const bundle = read(`public/js/locales/${language}.js`);
    for (const key of currentPublicCopyKeys) {
      expect(bundle).toContain(JSON.stringify(key));
    }
  }
});


const directoryI18n = read("public/i18n.js");
const directoryPages = [
  "public/index.html",
  "public/services.html",
  "public/regions.html",
  "public/laboratories.html",
  "public/radiology.html",
  "public/physiotherapy.html",
  "public/medical-equipment.html",
  "public/caregivers.html",
  "public/hospitals.html",
  "public/faq.html",
  "public/guide.html",
  "public/offline.html",
  "public/patient-care.html"
];

test("public directory and information pages load the refreshed five-language engine", () => {
  for (const path of directoryPages) {
    expect(read(path)).toContain("/i18n.js?v=6");
  }
});

test("directory, category, FAQ, guide, and CV copy has explicit English, French, Italian, and German translations", () => {
  for (const source of [
    "دليل المراكز والخدمات الطبية المعتمدة",
    "منصة RAFIQ معلوماتية وإعلانية. تعرض المراكز والخدمات التي راجعتها الإدارة واعتمدت بياناتها فقط.",
    "المختبرات الطبية",
    "الأشعة والتصوير",
    "مراكز العلاج الفيزيائي",
    "المعدات الطبية",
    "الأسئلة الشائعة حول دليل RAFIQ",
    "كيف تستخدم دليل RAFIQ؟",
    "الدفع المسبق عبر Whish Money فقط. لا ترسل ملفات CV أو مستندات شخصية قبل تأكيد الدفع من إدارة RAFIQ. لا تشارك كلمة مرور Whish أو رمز OTP."
  ]) {
    const start = directoryI18n.indexOf("'" + source + "': {");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = directoryI18n.indexOf("}", start);
    const translation = directoryI18n.slice(start, end);
    for (const language of ["en", "fr", "it", "de"]) {
      expect(translation).toContain(language + ":");
    }
  }
});

test("Lebanon regions directory localizes generated district and locality labels", () => {
  const regions = read("public/regions.html");
  for (const language of ["ar", "en", "fr", "it", "de"]) {
    expect(regions).toContain(language + ":{districts:");
  }
  expect(regions).toContain("document.addEventListener('rafiq:i18n',render)");
});

test("public language engine parses as valid JavaScript", () => {
  expect(() => new Function(directoryI18n)).not.toThrow();
});

test("switching the directory language back to Arabic restores the original page title", () => {
  expect(directoryI18n).toContain("if (code === DEFAULT) document.title = originalDocumentTitle;");
});


test("Cloudflare Pages never proxies API traffic to the retired Render backend", () => {
  const legacyProxy = resolve(import.meta.dir, "../../functions/api/[[path]].ts");
  expect(existsSync(legacyProxy)).toBe(false);
  for (const path of ["functions/api/agent/chat.ts", "functions/api/telegram/webhook.ts"]) {
    expect(read(path).toLowerCase()).not.toContain("onrender.com");
    expect(read(path).toLowerCase()).not.toContain("rafiq-o6qd");
  }
});


test("interactive map exposes functional region filters and accessible Map/List controls", () => {
  expect(mapPage).toContain('id="governorate"');
  expect(mapPage).toContain('id="district"');
  expect(mapPage).toContain('id="locality"');
  expect(mapPage).toContain('id="showMap"');
  expect(mapPage).toContain('id="showList"');
  expect(mapPage).toContain("addEventListener('change'");
  expect(mapPage).toContain("addEventListener('click'");
  expect(mapPage).toContain('window.RAFIQ_LOCATIONS');
  expect(mapPage).toContain('title="خريطة تفاعلية للبنان من OpenStreetMap"');
  expect(mapPage).toContain('href="/regions.html"');
});

test("homepage and CV navigation retain the official service routes", () => {
  expect(homepage).toContain('href="/services.html"');
  expect(homepage).toContain('href="/map.html"');
  expect(homepage).toContain('href="/caregivers.html"');
  expect(read("public/caregivers.html")).toContain('id="cv-service"');
  expect(read("public/caregivers.html")).toContain('href="/services.html"');
});

test("official RAFIQ origin, PWA manifests, installer and service worker are aligned for release", () => {
  const legacyManifest = JSON.parse(read("public/manifest.json"));
  const modernManifest = JSON.parse(read("public/manifest.webmanifest"));
  expect(legacyManifest.start_url).toBe("/?source=pwa");
  expect(legacyManifest.scope).toBe("/");
  expect(legacyManifest.display).toBe("standalone");
  expect(legacyManifest.icons.some((x: any) => x.purpose === "maskable")).toBe(true);
  expect(legacyManifest.shortcuts.some((x: any) => x.url === "/hospitals.html")).toBe(true);
  expect(legacyManifest.shortcuts.some((x: any) => x.url === "/map.html")).toBe(true);
  expect(homepage).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  expect(legacyManifest.shortcuts.some((x: any) => x.url === "/caregivers.html#cv-service")).toBe(true);
  expect(modernManifest.start_url).toBe(legacyManifest.start_url);
  expect(modernManifest.shortcuts.map((x: any) => x.url)).toEqual(legacyManifest.shortcuts.map((x: any) => x.url));
  expect(homepage).toContain('href="https://rafiq-lebanon.pages.dev/"');
  expect(homepage).toContain('/install-app.js?v=91');
  expect(homepage).toContain('/install-pwa.js?v=91');
  expect(serviceWorker).toContain('rafig-v91-20261128');
  expect(read("public/install-app.js")).toContain('/sw.js?v=91');
  expect(read("public/robots.txt")).toContain('Sitemap: https://rafiq-lebanon.pages.dev/sitemap.xml');
  expect(sitemap).toContain('https://rafiq-lebanon.pages.dev/');
  expect(sitemap).not.toContain('rafiq-o6qd.onrender.com');
});


const securityMigration = read("supabase/migrations/20261128135338_layered_security_hardening.sql");
const securityHeaders = read("public/_headers");

test("database hardening narrows admin RLS policies and removes legacy anonymous barcode lookup", () => {
  expect(securityMigration).toContain("do $rafig$");
  expect(securityMigration).toContain("$rafig$;");
  expect(securityMigration).toContain("revoke all on function public.public_lookup_issued_barcode(text)");
  expect(securityMigration).toContain("grant execute on function public.public_lookup_issued_barcode(text) to service_role");
  expect(securityMigration).toContain("alter policy public_members_admin_all on public.public_members");
  expect(securityMigration).toContain("to authenticated");
  expect(securityMigration).toContain("using (public.is_admin()) with check (public.is_admin())");
  expect(securityMigration).toContain("revoke truncate, references, trigger on table %I.%I from anon, authenticated");
  expect(securityMigration.toLowerCase()).not.toMatch(/drop table|delete from|truncate table/);
});

test("Cloudflare Pages emits hardened transport, framing, MIME, CSP and cache headers", () => {
  for (const headers of [securityHeaders, build]) {
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests");
    expect(headers).toContain("Cache-Control: no-cache");
  }
});


test("public intake enforces bounded JSON parsing and server-side per-IP rate limits", () => {
  expect(publicIntakeFunction).toContain("MAX_BODY_BYTES = 64 * 1024");
  expect(publicIntakeFunction).toContain("readBounded(req, MAX_BODY_BYTES)");
  expect(publicIntakeFunction).toContain("HMAC");
  expect(publicIntakeFunction).toContain("consume_rafig_public_rate_limit");
  expect(publicIntakeFunction).toContain("application_intake_10m");
  expect(publicIntakeFunction).toContain("application_intake_24h");
  expect(publicIntakeFunction).toContain("new HttpError(429, \"rate_limited\", 600)");
  expect(publicIntakeFunction).toContain("origin && !allowedOrigins.has(origin)");
  expect(publicIntakeFunction).not.toContain("return new Response(JSON.stringify({ok:false,error:e.message");
});

test("public upload verifies file signatures, bounds multipart bodies and serializes file-slot reservations", () => {
  expect(publicUploadFunction).toContain("MAX_BODY_BYTES = 35 * 1024 * 1024");
  expect(publicUploadFunction).toContain("MAX_TOTAL_FILE_BYTES = 30 * 1024 * 1024");
  expect(publicUploadFunction).toContain("file_content_mismatch");
  expect(publicUploadFunction).toContain("[0x25,0x50,0x44,0x46,0x2d]");
  expect(publicUploadFunction).toContain("[0xff,0xd8,0xff]");
  expect(publicUploadFunction).toContain("[0x89,0x50,0x4e,0x47");
  expect(publicUploadFunction).toContain("reserve_rafig_upload_slots");
  expect(publicUploadFunction).toContain("release_rafig_upload_slots");
  expect(publicUploadFunction).toContain("application_upload_10m");
  expect(publicUploadFunction).toContain("application_upload_24h");
  expect(publicUploadFunction).toContain("constantTimeEqual");
  expect(publicUploadFunction).toContain("savedIds");
  expect(publicUploadFunction).toContain("storagePaths");
});

test("visitor security migration keeps rate-limit state private and RPC access service-role only", () => {
  const migration = read("supabase/migrations/20261128161000_visitor_intake_security_layers.sql");
  expect(migration).toContain("create schema if not exists rafig_private");
  expect(migration).toContain("revoke all on schema rafig_private from public, anon, authenticated, service_role");
  expect(migration).toContain("create table if not exists rafig_private.public_rate_limits");
  expect(migration).toContain("create table if not exists rafig_private.application_upload_reservations");
  expect(migration).toContain("set search_path = ''");
  expect(migration).toContain("grant execute on function public.consume_rafig_public_rate_limit");
  expect(migration).toContain("grant execute on function public.reserve_rafig_upload_slots");
  expect(migration).toContain("grant execute on function public.release_rafig_upload_slots");
  expect(migration.toLowerCase()).not.toMatch(/drop table|delete from public\./);
});
