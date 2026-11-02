import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dir, "../../supabase/functions/public-application-upload/index.ts"), "utf8");

test("passport is not an accepted application document category", () => {
  const categoryLine = source.split("\n").find((line) => line.includes("const cats=new Set("));
  expect(categoryLine).toBeDefined();
  expect(categoryLine).not.toContain('"passport"');
  expect(source).toContain('throw new Error("invalid_document_category")');
});
