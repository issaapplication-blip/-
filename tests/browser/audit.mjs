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
const browser = await chromium.launch({ headless: true });
try {
  for (const path of pages) {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", error => failures.push(path + " JS: " + error.message));
    const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 500) failures.push(path + " HTTP " + (response ? response.status() : "no response"));
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
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
      if (!result.menuButton) failures.push(path + " menu trigger missing");
      if (result.menuButton && (result.menuButton.width < 44 || result.menuButton.height < 44)) failures.push(path + " @" + width + " menu touch target below 44px");
      const resources = await page.evaluate(() => Array.from(document.querySelectorAll("script[src],img[src],link[href]"))
        .map(el => { const raw = el.src || el.href; if (!raw) return null; const url = new URL(raw, location.href); return url.origin === location.origin ? url.pathname : null; })
        .filter(Boolean));
      for (const resource of new Set(resources)) {
        const rel = decodeURIComponent(resource).replace(/^\/+/, "") || "index.html";
        const target = resolve("dist", rel);
        if (!fs.existsSync(target)) failures.push(path + " missing local asset " + resource);
      }
      const htmlLinks = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
        .map(a => { const url = new URL(a.href, location.href); return url.origin === location.origin && (url.pathname === "/" || url.pathname.endsWith(".html")) ? url.pathname : null; })
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
