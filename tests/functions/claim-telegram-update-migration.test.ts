import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(import.meta.dir, "../../supabase/migrations/20261102190000_claim_telegram_update.sql"),
  "utf8",
);

test("claim_telegram_update exposes the exact named RPC arguments and return columns used by the webhook", () => {
  expect(migration).toContain("p_update_id bigint");
  expect(migration).toContain("p_lease_seconds integer DEFAULT 120");
  expect(migration).toContain("RETURNS TABLE(claimed boolean, current_status text)");
  expect(migration).toContain("public.claim_telegram_update(bigint, integer)");
});

test("claim RPC is atomic and does not reclaim completed updates", () => {
  expect(migration).toContain("ON CONFLICT (update_id) DO UPDATE");
  expect(migration).toContain("receipt.status <> 'completed'");
  expect(migration).toContain("receipt.lease_until <= now()");
  expect(migration).toContain("RETURN QUERY SELECT false, v_status");
});

test("receipt table and function are restricted to service_role", () => {
  expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  expect(migration).toContain("TO service_role");
});

test("proposed migration is additive and contains no destructive DDL", () => {
  expect(migration).not.toMatch(/\bDROP\s+(TABLE|FUNCTION|POLICY|INDEX)\b/i);
  expect(migration).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
