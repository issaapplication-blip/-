import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const intake = readFileSync(resolve(root, "supabase/functions/public-intake/index.ts"), "utf8");
const upload = readFileSync(resolve(root, "supabase/functions/public-application-upload/index.ts"), "utf8");

test("public intake honors the form honeypot without creating an application", () => {
  expect(intake).toContain('if(clean(form.get("website"),160))return json({ok:true,status:"received"})');
});

test("public intake accepts the exact files/document_category fields emitted by the website forms", () => {
  expect(intake).toContain('form.getAll("files")');
  expect(intake).toContain('form.getAll("document_category")');
  expect(intake).toContain("document_category:category");
});

test("public intake enforces file MIME, category, count and size on the server", () => {
  expect(intake).toContain('new Set(["application/pdf","image/jpeg","image/png"])');
  expect(intake).toContain("fileEntries.length>8");
  expect(intake).toContain("file.size>8*1024*1024");
  expect(intake).toContain("allowedCategories.has(fileCategories[index]||\"\")");
});

test("nurse, caregiver, physiotherapist, doctor, family and membership submissions are accepted by role mapping", () => {
  for (const role of ['"caregiver"','"nurse"','"physiotherapist"','"doctor"','"family"','"member"']) expect(intake).toContain(role);
  expect(intake).toContain('clean(form.get("name"),200)');
  expect(intake).toContain('doctor:"انتساب طبيب"');
  expect(intake).toContain('member:"انتساب عام"');
});

test("passport is not an accepted document category in either public upload endpoint", () => {
  expect(upload).not.toContain('"passport"');
  expect(intake).not.toContain('"passport"');
});
