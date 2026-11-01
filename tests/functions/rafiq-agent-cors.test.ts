import { expect, test } from "bun:test";
import { loadFunction } from "./harness";

const BASE = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-for-tests",
};

test("rafiq-agent does not reflect arbitrary origins or emit wildcard CORS", async () => {
  const f = loadFunction("rafiq-agent", BASE, async () => { throw new Error("provider network must not be used"); });
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
    body: JSON.stringify({ message: "hello" }),
  }));
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test("rafiq-agent echoes only an explicitly configured allowed origin", async () => {
  const f = loadFunction("rafiq-agent", {
    ...BASE,
    RAFIQ_ALLOWED_ORIGINS: "https://rafiq.example,https://www.rafiq.example",
  }, async () => { throw new Error("provider network must not be used"); });
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://rafiq.example" },
    body: JSON.stringify({ message: "hello" }),
  }));
  expect(response.headers.get("access-control-allow-origin")).toBe("https://rafiq.example");
  expect(response.headers.get("vary")).toBe("Origin");
});
