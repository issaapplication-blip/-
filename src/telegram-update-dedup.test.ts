import { describe, expect, test } from "bun:test";
import { classifyTelegramUpdateClaim, parseTelegramUpdateId } from "./telegram-update-dedup";

describe("Telegram update id validation", () => {
  test("accepts non-negative safe integer update ids", () => {
    expect(parseTelegramUpdateId(0)).toBe(0);
    expect(parseTelegramUpdateId(123456)).toBe(123456);
  });
  test("rejects missing, string, fractional, negative, and unsafe ids", () => {
    for (const value of [undefined, null, "12", 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseTelegramUpdateId(value)).toBeNull();
    }
  });
});

describe("atomic claim result mapping", () => {
  test("only claimed updates are processed", () => {
    expect(classifyTelegramUpdateClaim("claimed")).toBe("claimed");
    expect(classifyTelegramUpdateClaim("completed")).toBe("duplicate");
    expect(classifyTelegramUpdateClaim("processing")).toBe("busy");
    expect(classifyTelegramUpdateClaim("unexpected")).toBe("invalid");
    expect(classifyTelegramUpdateClaim(null)).toBe("invalid");
  });
});
