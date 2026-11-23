import { RAFIQ_CONFIG } from "./rafiq-config";

/* RAFIQ | رفيق — approved directory and CV service knowledge. */
export const RAFIQ_TELEGRAM_BOT = RAFIQ_CONFIG.telegramBotUrl;
export const RAFIQ_TELEGRAM_CHANNEL = RAFIQ_CONFIG.telegramGroupUrl;
export const RAFIQ_WEBSITE = RAFIQ_CONFIG.platformUrl;
export const RAFIQ_WHATSAPP = RAFIQ_CONFIG.whatsappUrl;
export const RAFIQ_WHATSAPP_CHANNEL = RAFIQ_CONFIG.whatsappChannelUrl;
export const RAFIQ_WHATSAPP_NUMBER = RAFIQ_CONFIG.whatsappNumber;

export const RAFIQ_SERVICE_KNOWLEDGE = `
RAFIQ | رفيق — لبنان 🇱🇧
الموقع: ${RAFIQ_WEBSITE}
بوت Telegram الرسمي: ${RAFIQ_TELEGRAM_BOT}
قناة Telegram الرسمية: ${RAFIQ_TELEGRAM_CHANNEL}
WhatsApp الإدارة للمراسلات اليدوية فقط: ${RAFIQ_WHATSAPP_NUMBER} (${RAFIQ_WHATSAPP})
قناة WhatsApp: ${RAFIQ_WHATSAPP_CHANNEL}

نطاق العمل المعتمد:
- منصة معلوماتية ودليل إعلاني للمراكز المعتمدة فقط: المختبرات الطبية، مراكز الأشعة والتصوير، مراكز العلاج الفيزيائي، ومراكز بيع وتأجير المعدات الطبية.
- نطاق التغطية: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان.
- الخدمة الفردية الوحيدة التي تستقبل طلبات هي إعداد CV وCover Letter عبر ${RAFIQ_WEBSITE}caregivers.html.
- لا تستقبل RAFIQ طلبات رعاية منزلية أو تمريض أو توظيف أو انتساب أفراد أو تسجيل مراكز أو حجوزات. لا تجمع بيانات حالة أو ملفات طبية عبر الموقع أو المساعد.
- لا يظهر أي مركز أو إعلان أو عرض أو سعر متفق عليه إلا بعد مراجعة الإدارة وموافقتها.
- لا توجد نسبة خصم أو قيمة ثابتة أو جدول أسعار موحد. تراجع الإدارة نوع الفحص أو التصوير بدقة والسعر الفعلي لدى المركز، ثم تقرر إن كان الخصم متاحًا وتحدد قيمته وشروطه. لا تعد بخصم ولا تصدر كودًا قبل الموافقة. كل كود معتمد يستخدم مرة واحدة.
- العميل يتواصل ويدفع للمركز مباشرة؛ RAFIQ لا تستقبل أموال العملاء ولا تنفذ تحويلات للمراكز.
- لا تستخدم WhatsApp Cloud API أو Kapso أو أي رد آلي/إرسال آلي عبر WhatsApp. التواصل عبر WhatsApp يدوي ويبدأه العميل.
- لا تخترع أسماء مراكز أو عناوين أو أرقامًا أو أسعارًا أو خصومات أو أكوادًا أو ساعات عمل أو توفرًا.
- عند عدم وجود مركز معتمد منشور في الفئة أو المنطقة، قل إن الدليل قيد التجهيز.
- لا تقدم تشخيصًا أو وصف دواء أو تفسيرًا تشخيصيًا للتحاليل أو تعديل علاج. في الطوارئ وجّه المستخدم إلى الطوارئ المحلية أو الطبيب المعالج فورًا.
`;

const normalize = (s:string) => String(s||"").normalize("NFKC")
  .replace(/[\u064B-\u0652\u0640]/g,"")
  .replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").toLowerCase();

const EMERGENCY = /(?:طوارئ|طارئ|عاجل|فورا|فوراً|ضيق تنفس شديد|ألم صدر|نزيف شديد|فقدان الوعي|إغماء|تشنج|سكتة|اختناق|emergency|urgent|chest pain|unconscious|stroke)/i;
const SENSITIVE = [
  /(?:سعر|اسعار|الاسعار|تكلف|دفع|فاتور|تحويل|ويش|whish|refund|invoice|pay|price|cost|quote)/i,
  /(?:متوفر|توفر|احجز|حجز|booking|available|availability|موعد)/i,
  /(?:شكوى|نزاع|قانون|دعوى|عقد|اتفاق|شراكة|legal|complaint|dispute|partnership)/i,
  /(?:رقم شخصي|رقم مقدم|وثائق|هوية|ترخيص|مرخص|بيانات خاصة|تحقق من شخص)/i,
];
export const RAFIQ_SAFE_HANDOFF = `هذه النقطة تحتاج مراجعة مباشرة من إدارة رفيق. WhatsApp الرسمي للمراسلات اليدوية: ${RAFIQ_WHATSAPP_NUMBER} — ${RAFIQ_WHATSAPP}`;

export function rafiqRequiresHumanReply(message:string): boolean {
  const t=String(message||"").trim();
  if(!t || EMERGENCY.test(t)) return false;
  return SENSITIVE.some(r=>r.test(t));
}

export function answerRafiqKnowledge(message:string): string | null {
  const raw=String(message||"").trim();
  if(!raw) return null;
  const t=normalize(raw);

  if(EMERGENCY.test(raw))
    return "🚨 إذا كانت هناك حالة طارئة أو خطر فوري، تواصلوا فورًا مع الإسعاف أو الفريق الطبي المعالج. لا تنتظروا رد رفيق.";

  if(/(?:\bcv\b|cover\s*letter|cover\s*letters|سيره ذاتيه|السيره الذاتيه|سيرة ذاتية|سيره مهنيه|خطاب تقديم|رساله تقديم)/i.test(raw))
    return `خدمة RAFIQ المتاحة للأفراد هي إعداد CV وCover Letter. التفاصيل والأسعار المنشورة هنا: ${RAFIQ_WEBSITE}caregivers.html. لا نضيف مؤهلات أو خبرات غير موجودة في معلومات العميل.`;

  if(/(?:تقديم|انتساب|توظيف|تسجيل مقدم|تسجيل ممرض|تسجيل مركز|انضمام مقدم|caregiver application|provider registration|apply|register)/i.test(raw))
    return `لا يستقبل RAFIQ حاليًا طلبات انتساب أو توظيف أو تسجيل أفراد أو مراكز، ولا يفتح طلبات رعاية أو حجوزات. يمكنكم تصفح دليل المراكز المعتمدة: ${RAFIQ_WEBSITE}services.html، أو خدمة CV وCover Letter: ${RAFIQ_WEBSITE}caregivers.html.`;

  if(/(?:رعايه منزليه|رعاية منزلية|مقدم الرعايه|مقدم رعاية|caregiver|home care|home nursing|تمريض منزلي|ممرض|ممرضة|nurse|مريض|مسن|كبار السن)/i.test(raw))
    return `لا يوفر RAFIQ حاليًا خدمة توفير مقدم رعاية أو تمريض منزلي ولا يستقبل طلبات حالات. المنصة مخصصة لدليل المراكز الطبية المعتمدة وخدمة CV وCover Letter. تصفحوا الفئات المتاحة: ${RAFIQ_WEBSITE}services.html.`;

  if(/(?:خصم|تخفيض|كود|قسيمه|قسيمة|discount|coupon)/i.test(raw))
    return "لا توجد نسبة خصم أو قيمة موحدة. تراجع الإدارة نوع الفحص أو التصوير والسعر الفعلي لدى المركز، ثم تقرر إن كان الخصم متاحًا وتحدد قيمته وشروطه. لا يصدر أي كود قبل موافقة الإدارة، ويكون صالحًا لاستخدام واحد.";

  if(/(?:مختبر|تحاليل|فحوص|laborator)/i.test(raw))
    return `فئة المختبرات الطبية ضمن دليل RAFIQ. تُعرض أسماء المراكز وبياناتها بعد مراجعة الإدارة واعتمادها: ${RAFIQ_WEBSITE}laboratories.html.`;

  if(/(?:اشعه|أشعة|تصوير|رنين|طبقي|radiolog|imaging)/i.test(raw))
    return `فئة مراكز الأشعة والتصوير الطبي ضمن دليل RAFIQ. لا ننشر مركزًا قبل اعتماد بياناته: ${RAFIQ_WEBSITE}radiology.html.`;

  if(/(?:علاج فيزيائي|علاج طبيعي|فيزيائي|فيزيو|physio)/i.test(raw))
    return `فئة مراكز العلاج الفيزيائي المعتمدة ضمن دليل RAFIQ: ${RAFIQ_WEBSITE}physiotherapy.html. RAFIQ لا يقدم جلسات علاجية مباشرة ولا يقيّم الحالات طبيًا.`;

  if(/(?:معدات|كرسي|سرير طبي|جهاز طبي|بيع|تأجير)/i.test(raw))
    return `يشمل دليل RAFIQ مراكز بيع المعدات الطبية وتأجيرها بعد اعتماد بيانات المركز: ${RAFIQ_WEBSITE}medical-equipment.html.`;

  if(/(?:منطقه|منطقة|وين|اين|تغطيه|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت)/i.test(raw))
    return `مناطق دليل RAFIQ: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان. تصفحوا المناطق والفئات المتاحة: ${RAFIQ_WEBSITE}regions.html.`;

  if(/(?:واتساب|whatsapp|تواصل|رقم الاداره|telegram|تلغرام|تيليجرام|قناة)/i.test(raw))
    return `للتواصل اليدوي مع إدارة رفيق: ${RAFIQ_WHATSAPP_NUMBER} — ${RAFIQ_WHATSAPP}\nبوت Telegram: ${RAFIQ_TELEGRAM_BOT}\nقناة Telegram: ${RAFIQ_TELEGRAM_CHANNEL}\nقناة WhatsApp: ${RAFIQ_WHATSAPP_CHANNEL}.`;

  if(/(?:خدمات|شنو تقدمون|do you do|تقدمون|services)/i.test(t))
    return `دليل RAFIQ يشمل المختبرات الطبية، الأشعة والتصوير، مراكز العلاج الفيزيائي، وبيع وتأجير المعدات الطبية. الخدمة الفردية المتاحة هي إعداد CV وCover Letter. تصفحوا الدليل: ${RAFIQ_WEBSITE}services.html.`;

  if(/(?:مرحبا|اهلا|السلام عليكم|hello|hi)/i.test(t))
    return "أهلًا وسهلًا بكم في RAFIQ 🌿 يمكنكم تصفح دليل المراكز المعتمدة أو الاستفسار عن خدمة CV وCover Letter.";

  return null;
}
