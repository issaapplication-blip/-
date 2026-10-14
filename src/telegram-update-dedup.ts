export type TelegramClaimDisposition = "claimed" | "duplicate" | "busy" | "invalid";

export function parseTelegramUpdateId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function classifyTelegramUpdateClaim(value: unknown): TelegramClaimDisposition {
  if (value === "claimed") return "claimed";
  if (value === "completed") return "duplicate";
  if (value === "processing") return "busy";
  return "invalid";
}
