import { describe, expect, test } from "bun:test";
import { resolveRafiqPlatformUrl } from "./rafiq-config";

describe("resolveRafiqPlatformUrl", () => {
  test("uses the current RAFIQ public site when no URL is configured", () => {
    expect(resolveRafiqPlatformUrl()).toBe("https://index-html.issaapplication.workers.dev");
    expect(resolveRafiqPlatformUrl("")).toBe("https://index-html.issaapplication.workers.dev");
  });

  test("normalizes a configured URL and preserves an explicit host", () => {
    expect(resolveRafiqPlatformUrl(" https://example.com/ ")).toBe("https://example.com");
  });
});
