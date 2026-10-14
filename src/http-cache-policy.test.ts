import { describe, expect, test } from "bun:test";
import { applySecurityHeaders } from "./http-cache-policy";

describe("HTTP cache policy", () => {
  test("preserves a deliberate public static-asset cache policy", () => {
    const response = new Response("asset", { headers: { "Cache-Control": "public, max-age=300" } });
    applySecurityHeaders(response, { "X-Frame-Options": "DENY", "Cache-Control": "no-store" });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
  test("defaults dynamic responses to no-store", () => {
    const response = new Response("{}");
    applySecurityHeaders(response, { "X-Content-Type-Options": "nosniff" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
