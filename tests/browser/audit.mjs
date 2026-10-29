import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
const packageRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;
if (!packageRoot) throw new Error("PLAYWRIGHT_PACKAGE_ROOT is required");
const { chromium } = await import(pathToFileURL(resolve(packageRoot, "index.mjs")).href);

const base = process.env.RAFIQ_TEST_BASE_URL || "http://127.0.0.1:4173";
const widths = [320, 360, 390, 768, 1280, 1920];
const fs = await import("node:fs");
const pathModule = await import("node:path");
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = pathModule.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".html") ? [path] : [];
  });
}
const pages = htmlFiles("dist").map(path => "/" + pathModule.relative("dist", path).split(pathModule.sep).join("/"));
const failures = [];
try {
  const manifestRaw = fs.readFileSync(resolve("dist", "manifest.webmanifest"), "utf8");
  const manifest = JSON.parse(manifestRaw);
  const manifestJson = fs.readFileSync(resolve("dist", "manifest.json"), "utf8");
  if (manifestRaw !== manifestJson) failures.push("manifest.json and manifest.webmanifest differ");
  for (const icon of manifest.icons || []) {
    if (!fs.existsSync(resolve("dist", icon.src.replace(/^\/+/, "")))) failures.push("manifest icon missing: " + icon.src);
  }
  const sw = fs.readFileSync(resolve("dist", "sw.js"), "utf8");
  if (/["']\/(?:admin|dashboard)\.html["']|["']\/admin\.js["']/.test(sw)) failures.push("Service Worker precaches an administration asset");
  const installScript = fs.readFileSync(resolve("dist", "install-app.js"), "utf8");
  if (!installScript.includes('/sw.js?v=85')) failures.push("PWA registration is not pinned to Service Worker v85");
  if (!installScript.includes("إضافة إلى الشاشة الرئيسية")) failures.push("iOS Add to Home Screen instructions missing");
  if (/تم تثبيت.{0,20}بنجاح/.test(installScript)) failures.push("PWA installer contains a false installation-success message");
} catch (error) {
  failures.push("PWA manifest/asset audit failed: " + String(error));
}
const browser = await chromium.launch({ headless: true });
try {
  for (const path of pages) {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", error => failures.push(path + " JS: " + error.message));
    const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 500) failures.push(path + " HTTP " + (response ? response.status() : "no response"));
    if (path === "/app.html") {
      const consentCount = await page.locator('#form input[name="privacy_consent"][required]').count();
      if (!consentCount) failures.push("public intake form missing required privacy consent checkbox");
    }
    await page.addScriptTag({ path: resolve(packageRoot, "../axe-core/axe.min.js") }).catch(error => failures.push(path + " axe-core load failed: " + error.message));
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        replacementChar: document.documentElement.innerText.includes("\uFFFD"),
        menuButton: (() => {
          const el = document.querySelector(".topbar-menu > summary");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height, right: r.right };
        })()
      }));
      if (result.scrollWidth > result.width + 1) failures.push(path + " @" + width + " horizontal overflow " + result.scrollWidth + ">" + result.width);
      if (result.replacementChar) failures.push(path + " @" + width + " contains Unicode replacement character");
      if (result.lang.toLowerCase().startsWith("ar") && result.dir !== "rtl") failures.push(path + " @" + width + " Arabic document is not RTL");
      if (!result.menuButton) failures.push(path + " menu trigger missing");
      if (result.menuButton && (result.menuButton.width < 44 || result.menuButton.height < 44)) failures.push(path + " @" + width + " menu touch target below 44px");
      const smallControls = await page.evaluate(() => Array.from(document.querySelectorAll("button,[role=button],input[type=button],input[type=submit],summary"))
        .filter(el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && (r.width < 44 || r.height < 44); })
        .map(el => ({ text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("type") || el.tagName).trim().slice(0, 50), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) }).slice(0, 5));
      if (smallControls.length) failures.push(path + " @" + width + " touch controls below 44px: " + JSON.stringify(smallControls));
      if (width === 390) {
        const contrast = await page.evaluate(async () => {
          if (!window.axe) return [{ id: "axe-missing", nodes: [] }];
          const result = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
          return result.violations.map(v => ({ id: v.id, nodes: v.nodes.slice(0, 3).map(n => n.target) }));
        });
        for (const violation of contrast) failures.push(path + " contrast " + violation.id + ": " + JSON.stringify(violation.nodes));
      }
      const resources = await page.evaluate(() => Array.from(document.querySelectorAll("script[src],img[src],link[href]"))
        .map(el => { const raw = el.src || el.href; if (!raw) return null; const url = document.createElement("a"); url.href = raw; return url.origin === location.origin ? url.pathname : null; })
        .filter(Boolean));
      for (const resource of new Set(resources)) {
        const rel = decodeURIComponent(resource).replace(/^\/+/, "") || "index.html";
        const target = resolve("dist", rel);
        if (!fs.existsSync(target)) failures.push(path + " missing local asset " + resource);
      }
      const htmlLinks = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
        .map(a => { const url = document.createElement("a"); url.href = a.href; return url.origin === location.origin && (url.pathname === "/" || url.pathname.endsWith(".html")) ? url.pathname : null; })
        .filter(Boolean));
      for (const linkedPath of new Set(htmlLinks)) {
        const rel = linkedPath === "/" ? "index.html" : decodeURIComponent(linkedPath).replace(/^\/+/, "");
        if (!fs.existsSync(resolve("dist", rel))) failures.push(path + " broken internal page link " + linkedPath);
      }
      if (path === "/index.html" || path === "/") {
        if (width === 390) {
          const summary = page.locator(".topbar-menu > summary").first();
          if (await summary.count()) {
            await summary.click();
            if (!(await page.locator(".topbar-menu").first().evaluate(el => el.open))) failures.push("homepage menu did not open");
            await page.keyboard.press("Escape");
            if (await page.locator(".topbar-menu").first().evaluate(el => el.open)) failures.push("homepage menu did not close on Escape");
            await summary.click();
            await page.locator("body").click({ position: { x: 4, y: 600 } });
            if (await page.locator(".topbar-menu").first().evaluate(el => el.open)) failures.push("homepage menu did not close on outside click");
          } else failures.push("homepage menu trigger missing");
        }
      }
    }
    if (path === "/index.html") {
      const languageButton = page.locator(".ra-lang-btn").first();
      for (const code of ["ar", "en", "fr", "it", "de"]) {
        await languageButton.click();
        const choice = page.locator('.ra-lang-menu [data-lang="' + code + '"]').first();
        if (!(await choice.count())) {
          failures.push("homepage language option missing: " + code);
          continue;
        }
        await choice.click();
        await page.waitForFunction(code => document.documentElement.lang === code, code, { timeout: 5000 }).catch(() => failures.push("homepage language did not activate: " + code));
        const languageState = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, text: document.body.innerText }));
        if (languageState.lang !== code) failures.push("homepage language mismatch: expected " + code + ", got " + languageState.lang);
        if (languageState.dir !== (code === "ar" ? "rtl" : "ltr")) failures.push("homepage direction mismatch for " + code + ": " + languageState.dir);
        if (languageState.text.includes("\\uFFFD")) failures.push("homepage " + code + " contains Unicode replacement character");
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error("RAFIQ browser audit failures (" + failures.length + "):\n" + failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("RAFIQ browser audit passed: " + pages.length + " pages × " + widths.length + " viewports; menu keyboard/outside-click checks passed.");
}
