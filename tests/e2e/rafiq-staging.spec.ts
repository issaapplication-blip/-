import { test, expect, type Page } from "@playwright/test";

const pages = [
  { path: "/nurses.html", role: "nurse", title: /الممرضون/ },
  { path: "/caregivers.html", role: "caregiver", title: /مقدمو/ },
  { path: "/physiotherapists.html", role: "physiotherapist", title: /المعالجون/ },
  { path: "/ads.html", role: "institution", title: /أعلن معنا/ },
  { path: "/doctors.html", role: "doctor", title: /الأطباء/ },
  { path: "/families.html", role: "family", title: /الرعاية/ },
  { path: "/members.html", role: "member", title: /المنتسبون/ },
] as const;

const pdfFixture = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
);

async function fillRequiredFields(page: Page) {
  const form = page.locator("form[data-rafig-intake-form]");
  await expect(form).toHaveCount(1);

  const required = form.locator("input[required], select[required], textarea[required]");
  for (let i = 0; i < await required.count(); i++) {
    const field = required.nth(i);
    const type = await field.getAttribute("type");
    const name = await field.getAttribute("name");

    if (type === "file") {
      await field.setInputFiles({
        name: `rafig-e2e-${name || i}.pdf`,
        mimeType: "application/pdf",
        buffer: pdfFixture,
      });
      continue;
    }
    if (type === "checkbox") {
      await field.check();
      continue;
    }
    if (type === "number") {
      const min = await field.getAttribute("min");
      await field.fill(min || "1");
      continue;
    }
    if (await field.evaluate((el) => el.tagName === "SELECT")) {
      const value = await field.locator("option").evaluateAll((options) => {
        const option = options.find((item) => (item as HTMLOptionElement).value !== "");
        return option ? (option as HTMLOptionElement).value : "";
      });
      if (value) await field.selectOption(value);
      continue;
    }
    if (type === "tel") {
      await field.fill("70000001");
      continue;
    }
    if (type === "email") {
      await field.fill("rafiq-e2e@example.invalid");
      continue;
    }
    await field.fill(`اختبار آلي RAFIQ ${name || i}`);
  }

  // Optional but useful fields used by some backend validation paths.
  const phone = form.locator('input[name="phone"]');
  if (await phone.count() && !(await phone.inputValue())) await phone.fill("70000001");
}

test.describe("RAFIQ staging intake acceptance", () => {
  for (const item of pages) {
    test(`${item.role}: route, responsive layout and real staging submission`, async ({ page, isMobile }) => {
      await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1365, height: 900 });
      const response = await page.goto(item.path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `GET ${item.path}`).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("h1")).toContainText(item.title);
      await expect(page.locator("form[data-rafig-intake-form]")).toHaveAttribute("data-role", item.role);

      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, "horizontal overflow on the page").toBeLessThanOrEqual(dimensions.viewport + 1);

      await fillRequiredFields(page);
      await page.locator("form[data-rafig-intake-form] button[type=submit]").click();

      const message = page.locator("[data-form-message]");
      await expect(message).toBeVisible();
      await expect(message).toContainText(/تم استلام طلبك بنجاح/);
      await expect(message).not.toContainText(/تعذر|خطأ|غير مسموح/);
    });
  }

  test("internal navigation links resolve and external links are well-formed", async ({ page, request, baseURL }) => {
    const routes = ["/", ...pages.map((item) => item.path)];
    const broken: string[] = [];

    for (const route of routes) {
      const response = await request.get(route);
      if (!response.ok()) broken.push(`${route} -> HTTP ${response.status()}`);
      if (!response.ok()) continue;

      const html = await response.text();
      const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1]);
      for (const href of hrefs) {
        if (/^(mailto:|tel:|sms:|javascript:)/i.test(href)) continue;
        let url: URL;
        try {
          url = new URL(href, baseURL);
        } catch {
          broken.push(`${route} -> invalid href: ${href}`);
          continue;
        }
        if (url.origin !== new URL(baseURL!).origin) continue;
        const linkResponse = await request.get(url.pathname + url.search);
        if (!linkResponse.ok()) broken.push(`${route} -> ${href} -> HTTP ${linkResponse.status()}`);
      }
    }
    expect(broken, "Broken internal links:\\n" + broken.join("\\n")).toEqual([]);
  });

  test("return-to-home links work from all seven intake pages", async ({ page }) => {
    for (const item of pages) {
      await page.goto(item.path);
      const home = page.locator('a[href="/"]').first();
      await expect(home).toBeVisible();
      await home.click();
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("mobile viewport does not clip the form submit button", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/nurses.html");
    const button = page.locator("form button[type=submit]");
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  });
});
