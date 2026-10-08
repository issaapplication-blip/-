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
    const error = new Error(`Telegram API error (${response.status}): ${String(result?.description ?? "unknown error").slice(0,180)}`) as Error & { telegramStatus?: number; retryAfter?: number; telegramDescription?: string };
    error.telegramStatus = response.status;
    error.retryAfter = Number(result?.parameters?.retry_after ?? 0) || undefined;
    error.telegramDescription = typeof result?.description === "string" ? result.description : undefined;
    throw error;
  }
  return result;
};

const RAFIQ_TELEGRAM_SIGNATURE = "— فريق رفيق | RAFIQ 🇱🇧";
const signedText = (text: string) => text.includes(RAFIQ_TELEGRAM_SIGNATURE) ? text : `${text}\n\n${RAFIQ_TELEGRAM_SIGNATURE}`;

export const telegramSendText = async (chatId: string | number, text: string, replyMarkup?: Record<string, unknown>) =>
  callTelegram("sendMessage", {
    chat_id: chatId,
    text: signedText(text),
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

export const telegramSendContactRequest = async (chatId: string | number) =>
  telegramSendText(chatId, "لربط حساب Telegram برقم هاتفك في RAFIQ، اضغط الزر أدناه ثم شارك رقمك مع البوت.", {
    keyboard: [[{ text: "📱 مشاركة رقم الهاتف", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  });

export const telegramSendDocument = async (chatId: string | number, documentFileId: string, caption?: string) =>
  callTelegram("sendDocument", {
    chat_id: chatId,
    document: documentFileId,
    ...(caption ? { caption: signedText(caption) } : {}),
  });

export const telegramSetWebhook = async (url: string, secretToken?: string) =>
  callTelegram("setWebhook", {
    url,
    ...(secretToken ? { secret_token: secretToken } : {}),
    allowed_updates: ["message","channel_post"],
    drop_pending_updates: false,
  });

export const telegramAnswerCallbackQuery = async (callbackQueryId: string, text?: string) =>
  callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });

export const telegramDeleteWebhook = async () =>
  callTelegram("deleteWebhook", { drop_pending_updates: false });

export const telegramGetWebhookInfo = async () =>
  callTelegram("getWebhookInfo", {});

export const verifyTelegramWebhookSecret = (request: Request) => {
  const expected = telegramWebhookSecret();
  if (!expected) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
};

export const telegramSendPhoto = async (chatId: string | number, photo: string, caption?: string, replyMarkup?: Record<string, unknown>) =>
  callTelegram("sendPhoto", {
    chat_id: chatId,
    photo,
    ...(caption ? { caption: signedText(caption) } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
