import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dir, "../../supabase/functions/public-application-upload/index.ts"), "utf8");

test("passport is not an accepted application document category", () => {
  const categories = source.match(/const cats =?new Set\(\[([^\]]+)\]\)/);
  expect(categories).not.toBeNull();
  expect(categories?.[1]).not.toContain('"passport"');
  expect(source).toContain('throw new Error("invalid_document_category")');
});
