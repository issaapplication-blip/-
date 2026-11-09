import { describe, expect, test } from "bun:test";
import { loadFunction } from "./harness";

const BASE = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc-test-key-0000000000000000" };
const post = (body: any, headers: Record<string, string> = {}) =>
  new Request("https://f.invalid/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("retired RAFIQ web agent", () => {
  test("returns HTTP 410 without database or provider calls", async () => {
    const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("no network expected"); });
    const response = await f.handler(post({ message: "مرحبا", channel: "whatsapp", conversation_id: "meta:+96100000000" }));
    expect(response.status).toBe(410);
    const body: any = await response.json();
    expect(body.error).toContain("retired");
    expect(f.calls.length).toBe(0);
  });
});

describe("public intake CORS origin allowlist", () => {
  for (const functionName of ["public-application-intake", "public-application-upload"]) {
    test(`${functionName} permits only the configured Pages origin and known GitHub Pages origin`, async () => {
      const f = loadFunction(functionName, { ...BASE, RAFIQ_PUBLIC_SITE_URL: "https://rafiq-new.pages.dev/" }, async () => { throw new Error("no network expected"); });
      const accepted = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://rafiq-new.pages.dev", "Access-Control-Request-Method": "POST" } }));
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get("Access-Control-Allow-Origin")).toBe("https://rafiq-new.pages.dev");
      const known = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://issaapplication-blip.github.io", "Access-Control-Request-Method": "POST" } }));
      expect(known.headers.get("Access-Control-Allow-Origin")).toBe("https://issaapplication-blip.github.io");
      const retired = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://rafiq-o6qd.onrender.com", "Access-Control-Request-Method": "POST" } }));
      expect(retired.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const unconfigured = await f.handler(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "POST" } }));
      expect(unconfigured.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  }
});
