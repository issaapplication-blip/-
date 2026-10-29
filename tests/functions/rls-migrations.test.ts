import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(import.meta.dir, "../../supabase/migrations/20261029150000_bookings_rls_hardening.sql"),
  "utf8",
);

test("bookings RLS migration is guarded, admin-gated, and non-destructive", () => {
  expect(migration).toContain("to_regclass('public.bookings') IS NULL");
  expect(migration).toContain("ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY");
  expect(migration).toContain("REVOKE ALL ON TABLE public.bookings FROM anon, authenticated");
  expect(migration).toContain("GRANT SELECT, UPDATE ON TABLE public.bookings TO authenticated");
  expect(migration).toContain("USING (public.is_admin())");
  expect(migration).toContain("WITH CHECK (public.is_admin())");
  expect(migration).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
});
