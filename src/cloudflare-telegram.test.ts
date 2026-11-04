import { describe, expect, test } from "bun:test";
import { constantTimeSecretMatch, normalizeTelegramText } from "../functions/api/telegram/webhook";

describe("RAFIQ Cloudflare Telegram webhook helpers", () => {
  test("accepts an exact valid Telegram webhook secret", () => {
    const secret = "Rafiq_telegram_secret_2026_for_test_only";
    expect(constantTimeSecretMatch(secret, secret)).toBe(true);
  });
  test("rejects short, missing, and mismatched secrets", () => {
    expect(constantTimeSecretMatch("short", "short")).toBe(false);
    expect(constantTimeSecretMatch("A".repeat(32), "")).toBe(false);
    expect(constantTimeSecretMatch("A".repeat(32), "B".repeat(32))).toBe(false);
  });
  test("normalizes Arabic letter variants and diacritics", () => {
    expect(normalizeTelegramText("  أَسْعَارُ   الرِّعَايَة  ")).toBe("اسعار الرعاية");
  });
});
