import { chromium } from "playwright";

const base = process.env.RAFIQ_TEST_BASE_URL || "http://127.0.0.1:4173";
const widths = [320, 360, 390, 768, 1280, 1920];
const pages = ["/", "/services.html", "/app.html", "/privacy.html", "/terms.html", "/consent.html", "/404.html", "/complete.html"];
const failures = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const path of pages) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      page.on("pageerror", error => failures.push(path + " @" + width + " JS: " + error.message));
      const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
      if (!response || response.status() >= 500) failures.push(path + " @" + width + " HTTP " + (response ? response.status() : "no response"));
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
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
      if (result.menuButton && (result.menuButton.width < 44 || result.menuButton.height < 44)) failures.push(path + " @" + width + " menu touch target below 44px");
      if (path === "/" && width === 390) {
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
      await page.close();
    }
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
