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


test("Cloudflare build publishes an allowlisted directory-only site bundle", () => {
  expect(build).toContain("RAFIQ_PUBLIC_BASE_URL");
  expect(build).toContain("FILES=(");
  expect(build).toContain("announcements.html");
  expect(build).toContain("rafiq.invalid");
  expect(build).toContain("onrender.com");
  expect(build).toContain('for retired in agent.html dashboard.html barcode.html install.html app.js install-pwa.js manifest.json i18n.js');
  expect(build).toContain('test -f "$OUT_DIR/announcements.html"');
  expect(build).not.toContain('cp -R "$PUBLIC_DIR/."');
  expect(build).toContain('include":["/api/*"]');
});

test("legacy-host validation scans only the built bundle, not source templates", () => {
  expect(workflow).toContain("grep -RniE 'onrender\\.com|rafiq-o6qd' dist/;");
  expect(workflow).not.toContain("dist/ public/");
});

test("retired public application pages are absent while CV remains in the PWA", () => {
  for (const path of ["public/app.html", "public/member.html", "public/caregiver-registration.html", "public/nurses.html", "public/families.html", "public/physiotherapists.html", "public/agent.html", "public/dashboard.html", "public/barcode.html", "public/install.html", "public/app.js", "public/install-pwa.js", "public/manifest.json", "public/i18n.js", "public/js/rafiq-agent.js", "public/js/rafiq-kb.js", "public/js/rafiq-welcome.js"]) {
    expect(existsSync(resolve(import.meta.dir, "../../" + path))).toBe(false);
  }
  expect(existsSync(resolve(import.meta.dir, "../../public/caregivers.html"))).toBe(true);
  expect(existsSync(resolve(import.meta.dir, "../../public/announcements.html"))).toBe(true);
  expect(manifest.shortcuts.some((x: any) => x.url === "./caregivers.html#cv-service")).toBe(true);
  expect(manifest.shortcuts.some((x: any) => String(x.url).includes("app.html"))).toBe(false);
  expect(sitemap).toContain("/announcements.html");
  for (const old of ["elderly-care.html", "patient-care.html", "home-nursing.html", "guide.html", "tripoli.html", "beirut.html"]) expect(sitemap).not.toContain(old);
});


test("public directory pages contain no external messaging shortcuts", () => {
  for (const path of ["public/index.html","public/announcements.html","public/services.html","public/regions.html","public/faq.html","public/caregivers.html","public/laboratories.html","public/radiology.html","public/physiotherapy.html","public/medical-equipment.html"]) {
    const html=read(path);
    expect(html).not.toContain("t.me/");
    expect(html).not.toContain("wa.me/");
    expect(html).not.toContain("whatsapp.com");
  }
});

test("public CV page inline script parses without executing", () => {
  const html=read("public/caregivers.html");
  const scripts=html.split("<script").slice(1).map(block=>{const tagEnd=block.indexOf(">");const endTag=block.indexOf("</script>",tagEnd+1);if(tagEnd<0||endTag<0||block.slice(0,tagEnd).includes("src="))return "";return block.slice(tagEnd+1,endTag);}).filter(Boolean);
  for(const script of scripts)expect(()=>new Function(script)).not.toThrow();
});

test("legacy RAFIQ service and location URLs redirect to the current directory", () => {
  const targets: Record<string,string> = {
    "elderly-care.html":"services.html",
    "patient-care.html":"services.html",
    "home-nursing.html":"services.html",
    "lebanon.html":"regions.html",
    "tripoli.html":"regions.html",
    "dinniyeh.html":"regions.html",
    "zgharta.html":"regions.html",
    "koura.html":"regions.html",
    "batroun.html":"regions.html",
    "beirut.html":"regions.html",
    "guide.html":"faq.html",
    "guide-after-hospital.html":"faq.html",
    "guide-caregiver-vs-nurse.html":"faq.html",
    "guide-choose-caregiver.html":"faq.html",
    "guide-elderly-home.html":"faq.html"
  };
  for(const [path,target] of Object.entries(targets)){
    const html=read("public/"+path);
    expect(html).toContain('noindex,follow');
    expect(html).toContain('location.replace("./'+target+'")');
  }
});

test("retired agent, dashboard, barcode and install surfaces return HTTP 410", () => {
  const source=read("src/index.ts");
  for(const path of ["agent.html","dashboard.html","barcode.html","install.html"]){
    expect(source).toContain('.get("/'+path+'"');
  }
  expect(source).toContain('status:410');
  expect(source).not.toContain('fileResponse("public/agent.html"');
  expect(source).not.toContain('fileResponse("public/dashboard.html"');
  expect(source).not.toContain('fileResponse("public/barcode.html"');
});

test("directory PWA cache no longer preloads retired agent or care application pages", () => {
  const sw=read("public/sw.js");
  for(const old of ["/js/rafiq-agent.js","/js/rafiq-kb.js","/barcode.html","/agent.html","/dashboard.html","/elderly-care.html","/patient-care.html","/home-nursing.html"]) expect(sw).not.toContain(old);
  expect(sw).toContain("announcements.html");
  expect(sw).toContain("caregivers.html");
});

test("PWA installer controller guard and service-worker registration use the same version and base path", () => {
  const installer=read("public/install-app.js");
  expect(installer).toContain("window.__RAFIQ_INSTALL_CONTROLLER_V86__=true;");
  expect(installer).not.toContain("window.__RAFIQ_INSTALL_CONTROLLER_V83__");
  expect(installer).toContain('new URL("sw.js?v=86",appBaseUrl)');
  expect(installer).toContain("scope:appBaseUrl.pathname");
  expect(read("public/sw.js")).toContain('var CACHE="rafig-v86-20261121"');
});


test("obsolete provider-intake admin script is removed", () => {
  expect(existsSync(resolve(import.meta.dir, "../../public/admin.js"))).toBe(false);
  expect(read("src/index.ts")).not.toContain('fileResponse("public/admin.js"');
});

test("admin dashboard requires database authorization and an active admin profile", () => {
  expect(adminHtml).toContain("db.rpc('is_admin')");
  expect(adminHtml).toContain("db.from('profiles').select('id,email,role,status')");
  expect(adminHtml).toContain("profile?.role!=='admin'||profile?.status!=='active'");
});

test("admin dashboard inline JavaScript parses without executing", () => {
  const scripts = adminHtml.split("<script").slice(1).map(block => { const tagEnd = block.indexOf(">"); const endTag = block.indexOf("</script>", tagEnd + 1); if (tagEnd < 0 || endTag < 0 || block.slice(0, tagEnd).includes("src=")) return ""; return block.slice(tagEnd + 1, endTag); }).filter(Boolean);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(() => new Function(script)).not.toThrow();
});

test("admin dashboard has no retired provider or institution intake controls", () => {
  expect(adminHtml).not.toContain("institution_intakes");
  expect(adminHtml).not.toContain("institution_intake_files");
  expect(adminHtml).not.toContain("طلبات الانتساب");
  expect(adminHtml).not.toContain("طلبات الرعاية");
  expect(adminHtml).toContain("directorySection");
  expect(adminHtml).toContain("CV وCover Letter");
});
