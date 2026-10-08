export const RAFIQ_CONFIG = {
  platformUrl: (process.env.PLATFORM_URL ?? "https://rafiq-o6qd.onrender.com").trim().replace(/\/$/, ""),
  telegramBotUrl: (process.env.TELEGRAM_BOT_URL ?? "https://t.me/RAFIQ_Care_Bot").trim(),
  telegramGroupUrl: (process.env.TELEGRAM_GROUP_URL ?? "https://t.me/+a7CDblNyGkw1Yjg8").trim(),
  whatsappChannelUrl: (process.env.WHATSAPP_CHANNEL_URL ?? "https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K").trim(),
  whatsappNumber: (process.env.WHATSAPP_NUMBER ?? "+961 81 506 299").trim(),
  whatsappUrl: (process.env.WHATSAPP_URL ?? "https://wa.me/96181506299").trim(),
} as const;

export const validateRafiqLinks = () => {
  const entries = Object.entries(RAFIQ_CONFIG).filter(([key]) => key.endsWith("Url"));
  const missing = entries.filter(([, value]) => !String(value).trim()).map(([key]) => key);
  if (missing.length) throw new Error("RAFIQ links are incomplete: " + missing.join(", "));
  return true;
};

export const rafiqFooter = () => {
  validateRafiqLinks();
  return [
    "🌿 RAFIQ | رفيق",
    "نصل بالحب والأمان لرعاية العائلة 🤍",
    "🌐 ادخل إلى منصة RAFIQ: " + RAFIQ_CONFIG.platformUrl,
    "🤖 تواصل مع RAFIQ عبر Telegram: " + RAFIQ_CONFIG.telegramBotUrl,
    "📢 انضم إلى مجموعة RAFIQ: " + RAFIQ_CONFIG.telegramGroupUrl,
    "📱 تابع قناة RAFIQ على WhatsApp: " + RAFIQ_CONFIG.whatsappChannelUrl,
  ].join("\n");
};

export const withRafiqFooter = (body:string) => {
  const clean=String(body||"").trim();
  if(!clean) throw new Error("message body is empty");
  return clean + "\n\n" + rafiqFooter();
};
