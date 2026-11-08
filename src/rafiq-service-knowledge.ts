import { RAFIQ_CONFIG } from "./rafiq-config";
/* RAFIQ | رفيق — approved medical-services directory knowledge. */
export const RAFIQ_TELEGRAM_BOT = RAFIQ_CONFIG.telegramBotUrl;
export const RAFIQ_TELEGRAM_CHANNEL = RAFIQ_CONFIG.telegramGroupUrl;
export const RAFIQ_WEBSITE = RAFIQ_CONFIG.platformUrl;
export const RAFIQ_WHATSAPP = RAFIQ_CONFIG.whatsappUrl;
export const RAFIQ_WHATSAPP_CHANNEL = RAFIQ_CONFIG.whatsappChannelUrl;
export const RAFIQ_WHATSAPP_NUMBER = RAFIQ_CONFIG.whatsappNumber;

export const RAFIQ_SERVICE_KNOWLEDGE = `
RAFIQ | رفيق — لبنان 🇱🇧
الشعار: نصل بالحب والأمان لرعاية العائلة.
الموقع: ${RAFIQ_WEBSITE}
بوت Telegram الرسمي: ${RAFIQ_TELEGRAM_BOT}
قناة Telegram الرسمية: ${RAFIQ_TELEGRAM_CHANNEL}
رقم WhatsApp للمراسلات اليدوية فقط: ${RAFIQ_WHATSAPP_NUMBER} (${RAFIQ_WHATSAPP})
قناة WhatsApp: ${RAFIQ_WHATSAPP_CHANNEL}

نموذج العمل:
- دليل مراكز للمساعدة الطبية والخصومات المعتمدة.
- الفئات: المختبرات الطبية؛ مراكز الأشعة والتصوير؛ مراكز العلاج الفيزيائي؛ مراكز بيع المعدات الطبية؛ مراكز تأجير المعدات الطبية.
- المناطق: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان.
- لا يضاف أي مركز أو إعلان أو عرض أو خصم إلا بعد موافقة إدارة RAFIQ.
- لا تُخترع أسماء مراكز أو أسعار أو نسب خصم أو أكواد أو مواعيد أو توفر.
- لا يصدر كود خصم إلا بعد اعتماد الإدارة لقيمة الخصم وشروطه والمركز.
- يتواصل العميل ويدفع للمركز مباشرة؛ RAFIQ لا تستقبل أموال العملاء ولا تنفذ تحويلات.
- لا توجد نماذج تقديم أو تسجيل أو رفع ملفات عبر الموقع أو البوت.
- لا تطلب كلمات مرور أو رموز تحقق أو تشخيصات أو ملفات طبية.
- WhatsApp هو التطبيق والقناة للتواصل والنشر اليدوي فقط؛ لا تستخدم Meta Cloud API أو Kapso أو أي إرسال آلي عبر WhatsApp.
- عند عدم وجود مركز معتمد، قل بوضوح إن دليل هذه الفئة قيد التجهيز.
- لا تقدم تشخيصًا أو وصف دواء أو تغيير علاج، ولا تستبدل الفريق الطبي.
- في الطوارئ، وجّه المستخدم فورًا إلى الطوارئ المحلية أو الفريق الطبي المعالج.
`;

const normalize = (s:string) => String(s||"").normalize("NFKC")
  .replace(/[\\u064B-\\u0652\\u0640]/g,"")
  .replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").toLowerCase();

const EMERGENCY = /(?:طوارئ|طارئ|عاجل|فورا|فوراً|ضيق تنفس شديد|ألم صدر|نزيف شديد|فقدان الوعي|إغماء|تشنج|سكتة|اختناق|emergency|urgent|chest pain|unconscious|stroke)/i;
const SENSITIVE = [
  /(?:سعر|اسعار|الاسعار|تكلف|دفع|فاتور|تحويل|ويش|whish|refund|invoice|pay|price|cost|quote)/i,
  /(?:متوفر|توفر|احجز|حجز|booking|available|availability|موعد)/i,
  /(?:شكوى|نزاع|قانون|دعوى|عقد|اتفاق|شراكة|legal|complaint|dispute|partnership)/i,
  /(?:رقم شخصي|رقم مقدم|وثائق|هوية|ترخيص|مرخص|بيانات خاصة|تحقق من شخص)/i,
];
export const RAFIQ_SAFE_HANDOFF = `هذه النقطة تحتاج مراجعة مباشرة من إدارة رفيق حتى نعطيكم جوابًا دقيقًا. WhatsApp الرسمي للمراسلات اليدوية: ${RAFIQ_WHATSAPP_NUMBER} — ${RAFIQ_WHATSAPP}`;

export function rafiqRequiresHumanReply(message:string): boolean {
  const t=String(message||"").trim();
  if(!t || EMERGENCY.test(t)) return false;
  return SENSITIVE.some(r=>r.test(t));
}

export function answerRafiqKnowledge(message:string): string | null {
  const raw=String(message||"").trim();
  if(!raw) return null;
  const t=normalize(raw);
  if(EMERGENCY.test(raw)) return "🚨 إذا كانت هناك حالة طارئة أو خطر فوري، تواصلوا فورًا مع الإسعاف أو الفريق الطبي المعالج. لا تنتظروا رد رفيق.";
  if(/(?:خصم|تخفيض|كود|قسيمه|قسيمة|discount|coupon)/i.test(raw))
    return "لا أستطيع تأكيد خصم أو إصدار كود قبل موافقة إدارة RAFIQ على المركز وقيمة الخصم وشروط الاستخدام. سيظهر فقط العرض المعتمد رسميًا.";
  if(/(?:مختبر|تحاليل|فحوص|laborator)/i.test(raw))
    return "فئة المختبرات الطبية ضمن دليل RAFIQ. ستظهر بيانات المراكز بعد مراجعتها واعتمادها من الإدارة.";
  if(/(?:اشعه|أشعة|تصوير|رنين|طبقي|radiolog|imaging)/i.test(raw))
    return "فئة مراكز الأشعة والتصوير الطبي ضمن دليل RAFIQ. لا ننشر مركزًا قبل اعتماد بياناته من الإدارة.";
  if(/(?:فيزيائي|طبيعي|فيزيو|physio)/i.test(raw))
    return "فئة مراكز العلاج الفيزيائي ضمن دليل RAFIQ. ستُنشر المراكز المعتمدة فقط.";
  if(/(?:معدات|كرسي|سرير طبي|جهاز طبي|بيع|تأجير)/i.test(raw))
    return "يشمل دليل RAFIQ مراكز بيع المعدات الطبية وتأجيرها. ستظهر بيانات المراكز بعد موافقة الإدارة.";
  if(/(?:منطقه|منطقة|وين|اين|تغطيه|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت)/i.test(raw))
    return "مناطق دليل RAFIQ: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان. لا يظهر أي مركز قبل اعتماده.";
  if(/(?:واتساب|whatsapp|تواصل|رقم الاداره)/i.test(raw))
    return `WhatsApp الإدارة للمراسلات اليدوية: ${RAFIQ_WHATSAPP_NUMBER} — ${RAFIQ_WHATSAPP}\\nقناة Telegram: ${RAFIQ_TELEGRAM_CHANNEL}\\nقناة WhatsApp: ${RAFIQ_WHATSAPP_CHANNEL}`;
  if(/(?:خدمات|شنو تقدمون|do you do|تقدمون)/i.test(t))
    return "خدمات الدليل: المختبرات الطبية، الأشعة والتصوير، العلاج الفيزيائي، بيع المعدات الطبية، وتأجير المعدات الطبية. اختر الفئة والمنطقة لعرض المراكز المعتمدة فقط.";
  if(/(?:مرحبا|اهلا|السلام عليكم|hello|hi)/i.test(t))
    return "أهلًا وسهلًا بكم في RAFIQ 🌿 اختروا نوع الخدمة أو المنطقة من القائمة. لا نستقبل طلبات تقديم أو ملفات عبر البوت.";
  return null;
}
