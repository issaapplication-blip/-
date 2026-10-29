import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

function trackedTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return trackedTypeScriptFiles(path);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test("runtime source has no Render URL fallback", () => {
  const sourceRoot = resolve(import.meta.dir, "../../src");
  const offenders = trackedTypeScriptFiles(sourceRoot)
    .filter(path => /onrender\.com/i.test(readFileSync(path, "utf8")))
    .map(path => path.replace(sourceRoot + "/", ""));
  expect(offenders).toEqual([]);
});
