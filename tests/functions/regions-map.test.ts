import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");

test("Lebanon map page uses OpenStreetMap and stays clear about unverified institution locations", () => {
  const map = read("public/map.html");
  expect(map).toContain("https://www.openstreetmap.org/export/embed.html");
  expect(map).toContain('title="خريطة تفاعلية للبنان من OpenStreetMap"');
  expect(map).toContain("لا تُرسم علامات قبل التحقق من الإحداثيات الدقيقة لكل مستشفى");
  expect(map).toContain("لا تُعرض مواقع تقديرية أو مواقع مؤسسات من الفئات الأخرى.");
  expect(map).toContain('href="/regions.html"');
  expect(map).toContain('loading="lazy"');
});

test("regions directory links to the interactive Lebanon map", () => {
  const regions = read("public/regions.html");
  expect(regions).toContain('href="/map.html"');
  expect(regions).toContain("خريطة لبنان التفاعلية");
});

test("Lebanon map is included in the public sitemap", () => {
  expect(read("public/sitemap.xml")).toContain("/map.html</loc>");
});
