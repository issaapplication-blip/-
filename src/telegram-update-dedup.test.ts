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

describe("atomic claim RPC response mapping", () => {
  test("accepts the live PostgREST table-returning RPC shape", () => {
    expect(classifyTelegramUpdateClaim([{claimed:true,current_status:"processing"}])).toBe("claimed");
    expect(classifyTelegramUpdateClaim([{claimed:false,current_status:"completed"}])).toBe("duplicate");
    expect(classifyTelegramUpdateClaim([{claimed:false,current_status:"processing"}])).toBe("busy");
  });
  test("rejects malformed or unknown claim results", () => {
    for (const value of [undefined, null, "claimed", [], [{claimed:true,current_status:"failed"}], [{claimed:false,current_status:"unknown"}]]) {
      expect(classifyTelegramUpdateClaim(value)).toBe("invalid");
    }
  });
});
