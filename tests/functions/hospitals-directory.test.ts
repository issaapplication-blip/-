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
  expect(page).toContain("/i18n.js?v=6");
  for (const lang of ["ar","en","fr","it","de"]) {
    const locale = read("public/js/locales/" + lang + ".js");
    expect(locale).toContain("hospitals.title");
    expect(locale).toContain("hospitals.address.notice");
  }
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


test("directory includes public and private hospitals from the official Ministry locator", () => {
  const page = read("public/hospitals.html");
  const publicBatch = read("supabase/migrations/20261128131825_add_public_hospitals_moph_locator.sql");
  expect(page).toContain("ownership_type");
  expect(page).toContain("hospitals.public");
  expect(page).toContain("hospitals.private");
  expect(publicBatch).toContain("Governmental Hospital");
  expect(publicBatch).toContain("https://www.moph.gov.lb/en/HealthFacilities/index/3/188/1");
});


test("hospital SELECT policies separate anonymous published reads from authenticated admin reads", () => {
  const policyMigration = read("supabase/migrations/20261128132154_consolidate_hospital_select_policies.sql");
  expect(policyMigration).toContain("to anon");
  expect(policyMigration).toContain("to authenticated");
  expect(policyMigration).toContain("is_published is true or public.is_admin()");
  expect(policyMigration).not.toContain("create policy hospitals_admin_read_all");
});
