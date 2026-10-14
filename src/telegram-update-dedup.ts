export type TelegramClaimDisposition = "claimed" | "duplicate" | "busy" | "invalid";

export function parseTelegramUpdateId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function classifyTelegramUpdateClaim(value: unknown): TelegramClaimDisposition {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "invalid";
  const result = row as { claimed?: unknown; current_status?: unknown };
  if (result.claimed === true && result.current_status === "processing") return "claimed";
  if (result.claimed === false && result.current_status === "completed") return "duplicate";
  if (result.claimed === false && result.current_status === "processing") return "busy";
  return "invalid";
}
