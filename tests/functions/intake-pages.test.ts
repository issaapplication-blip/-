import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../public");
const read = (name: string) => readFileSync(resolve(root, name), "utf8");

describe("RAFIQ dedicated public intake pages", () => {
  const pages = [
    ["nurses.html", 'data-role="nurse"', "data-required-documents=\"cv,nursing_certificate,nursing_license\""],
    ["caregivers.html", 'data-role="caregiver"', "data-required-documents=\"cv\""],
    ["physiotherapists.html", 'data-role="physiotherapist"', "data-required-documents=\"cv,certificate\""],
    ["doctors.html", 'data-role="doctor"', "data-required-documents=\"cv,certificate\""],
    ["families.html", 'data-role="family"', "إرسال طلب الرعاية"],
    ["members.html", 'data-role="member"', "انتسب الآن"],
    ["ads.html", 'data-role="institution"', 'name="institution_type"'],
  ] as const;

  for (const [page, marker, requirement] of pages) {
    test(page + " contains its intended form and home link", () => {
      const html = read(page);
      expect(html).toContain(marker);
      expect(html).toContain(requirement);
      expect(html).toContain('href="/"');
      expect(html).toContain('data-rafig-intake-form');
      expect(html).toContain('/js/rafiq-intake-pages.js');
      expect(html).toContain('/css/rafiq-intake-pages.css');
    });
  }

  test("shared form client uses the existing same-origin public-intake route", () => {
    const js = read("js/rafiq-intake-pages.js");
    expect(js).toContain('fetch("/api/public/intake"');
    expect(js).toContain('data.append("files"');
    expect(js).toContain('data.append("document_category"');
    expect(js).toContain('data.set("website","")');
    for (const [page] of pages) expect(read(page)).toContain('name="privacy_consent" value="accepted" required');
  });

  test("file policy is restricted to PDF/JPG/PNG and 8 MB per file", () => {
    const js = read("js/rafiq-intake-pages.js");
    expect(js).toContain('[".pdf","application/pdf"]');
    expect(js).toContain('[".jpg","image/jpeg"]');
    expect(js).toContain('[".jpeg","image/jpeg"]');
    expect(js).toContain('[".png","image/png"]');
    expect(js).toContain("8 * 1024 * 1024");
    expect(js).toContain("MAX_FILES = 8");
  });

  test("pages do not request passports or payment card details", () => {
    const html = pages.map(([page]) => read(page)).join("\\n");
    expect(html).not.toMatch(/passport|جواز سفر|رقم البطاقة|card number/i);
  });

  test("client confirmation and errors are rendered as text, not user-derived HTML", () => {
    const js = read("js/rafiq-intake-pages.js");
    expect(js).toContain("target.textContent=message");
    expect(js).not.toContain("innerHTML");
  });
});
