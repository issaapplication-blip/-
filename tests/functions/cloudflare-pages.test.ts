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
const backend = read("src/index.ts");
const adminMigration = read("supabase/migrations/20261120110000_require_active_admin_profile.sql");
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
