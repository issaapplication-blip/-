const TELEGRAM_API = "https://api.telegram.org";

const token = () => (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

export const telegramConfigured = () => Boolean(token());

export const telegramWebhookSecret = () =>
  (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

const callTelegram = async (method: string, body: Record<string, unknown>) => {
  const botToken = token();
  if (!botToken) throw new Error("Telegram bot token is not configured");
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true) {
    throw new Error(`Telegram API error (${response.status})`);
  }
  return result;
};

export const telegramSendText = async (chatId: string | number, text: string) =>
  callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });

export const telegramSetWebhook = async (url: string, secretToken?: string) =>
  callTelegram("setWebhook", {
    url,
    ...(secretToken ? { secret_token: secretToken } : {}),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });

export const telegramDeleteWebhook = async () =>
  callTelegram("deleteWebhook", { drop_pending_updates: false });

export const telegramGetWebhookInfo = async () =>
  callTelegram("getWebhookInfo", {});

export const verifyTelegramWebhookSecret = (request: Request) => {
  const expected = telegramWebhookSecret();
  if (!expected) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
};
