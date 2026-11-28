import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "../../" + path), "utf8");
const page = read("public/hospitals.html");
const migration = read("supabase/migrations/20261128131145_hospitals_directory_only.sql");

test("hospital directory reads only published hospital records from the existing Supabase project", () => {
  expect(page).toContain("qmuxaehrahfsnabyjens.supabase.co");
  expect(page).toContain("db.from('hospitals')");
  expect(page).toContain(".eq('is_published',true)");
  expect(page).toContain("tel:");
  expect(page).not.toContain("service_role");
});

test("hospital directory database policy exposes only published records to public visitors", () => {
  expect(migration).toContain("alter table public.hospitals enable row level security");
  expect(migration).toContain("grant select on table public.hospitals to anon");
  expect(migration).toContain("using (is_published is true)");
  expect(migration).toContain("public.is_admin()");
  expect(migration).toContain("latitude double precision");
  expect(migration).toContain("longitude double precision");
});

test("only hospitals are integrated; other provider categories remain out of this directory", () => {
  expect(migration).toContain("public.hospitals");
  expect(migration).not.toContain("institution_type in ('laboratory','radiology_center','medical_equipment_center','physiotherapy_center')");
  expect(page).toContain("دليل المستشفيات في لبنان");
});
