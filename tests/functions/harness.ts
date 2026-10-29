// Offline Edge Function harness: all database and provider calls are mocked.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DbCall = { table: string; op: string; args: any[]; filters: [string, any][] };

export function loadFunction(name: string, env: Record<string, string>, fetchImpl: (url: string, init?: any) => Promise<any>) {
  let raw = readFileSync(resolve(import.meta.dir, `../../supabase/functions/${name}/index.ts`), "utf8")
    .replace(/^import .*$/gm, "");
  if (name === "public-intake") {
    const uploadHelpers = readFileSync(resolve(import.meta.dir, "../../supabase/functions/_shared/upload-validation.ts"), "utf8")
      .replace(/^export\s+/gm, "");
    raw = uploadHelpers + "\n" + raw;
  }
  const src = new Bun.Transpiler({ loader: "ts" }).transformSync(raw);
  const calls: DbCall[] = [];
  const existing: Record<string, any> = {};

  const createClient = () => ({
    from(table: string) {
      const call: DbCall = { table, op: "select", args: [], filters: [] };
      calls.push(call);
      const b: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") return (resolve: any) => resolve({ data: null, error: null });
          if (prop === "insert" || prop === "upsert" || prop === "update") return (...args: any[]) => { call.op = prop; call.args = args; return b; };
          if (prop === "eq") return (column: string, value: any) => { call.filters.push([column, value]); return b; };
          if (prop === "maybeSingle") return async () => ({ data: existing[table] ?? null, error: null });
          if (prop === "single") return async () => ({ data: call.op === "upsert" && table === "rafiq_conversations" ? { id: "test-conversation-id" } : (existing[table] ?? null), error: null });
          return () => b;
        },
      });
      return b;
    },
  });

  let handler: (req: Request) => Promise<Response>;
  const Deno = { env: { get: (key: string) => env[key] }, serve: (fn: any) => { handler = fn; } };
  new Function("Deno", "createClient", "fetch", "crypto", "console", src)(Deno, createClient, fetchImpl, globalThis.crypto, { error() {}, log() {} });
  return { handler: (request: Request) => handler(request), calls, existing };
}
