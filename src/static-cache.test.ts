import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("logo and public image/font responses advertise a one-week browser cache", () => {
  expect(source).toContain('const STATIC_BINARY_CACHE="public, max-age=604800"');
  expect(source).toContain('fileResponse("public/assets/rafig-logo.png","image/png",STATIC_BINARY_CACHE)');
  expect(source).toContain('STATIC_BINARY_EXTENSIONS.has(ext.toLowerCase())?STATIC_BINARY_CACHE:"no-cache"');
});

test("HTML and executable assets are not added to the binary cache allowlist", () => {
  const allowlist = source.match(/STATIC_BINARY_EXTENSIONS=new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
  for (const ext of ["html", "js", "css", "json", "webmanifest"]) {
    expect(allowlist).not.toContain('"'+ext+'"');
  }
});
