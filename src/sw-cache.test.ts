import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("service worker checks cached binary assets before making a network request", () => {
  const binaryBranch = source.indexOf("Large public binary assets: cache first");
  const networkFirstBranch = source.indexOf('fetch(req, { cache: "no-store" })');
  expect(binaryBranch).toBeGreaterThanOrEqual(0);
  expect(networkFirstBranch).toBeGreaterThan(binaryBranch);
  expect(source).toContain("if (cached) return cached;");
  expect(source).toContain("k.put(req, res.clone())");
  expect(source).toContain('var CACHE = "rafig-v84-20261012"');
  expect(source).toMatch(/\/(?:\^)?\\\.\(\?:png\|jpe\?g\|webp\|avif\|svg\|ico\|woff2\?\)\$\/i/);
});

test("HTML, JavaScript, CSS and manifest remain network-first and bypass browser cache", () => {
  expect(source).toContain('fetch(req, { cache: "no-store" })');
  expect(source).toContain("// HTML, JavaScript, CSS, JSON and manifest stay network-first");
});
