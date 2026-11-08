import { answerRafiqKnowledge } from "./rafiq-service-knowledge";

export const rafiqFallback = (message:string) => {
  const known=answerRafiqKnowledge(message);
  if(known)return known;
  const text=String(message||"").trim();
  if(!text)return "أهلًا بك في RAFIQ | رفيق 🇱🇧. اختر فئة الخدمة أو المنطقة من القائمة.";
  if(/(?:طوارئ|اختناق|ضيق تنفس|الم صدر|ألم صدر|نزيف شديد|فقدان الوعي|إغماء|تشنج|سكتة|emergency|urgent|chest pain|unconscious|stroke)/i.test(text))
    return "🚨 إذا كانت هناك حالة طارئة أو خطر فوري، تواصلوا فورًا مع خدمات الطوارئ المحلية أو الفريق الطبي المعالج. لا تنتظروا رد رفيق.";
  if(/(?:طلب|تقديم|انتساب|تسجيل|cv|cover letter|upload|application|apply|request)/i.test(text))
    return "أُوقفت نماذج التقديم والتسجيل واستقبال الملفات والطلبات عبر RAFIQ. يمكنكم استخدام البوت لتصفح فئات دليل المراكز والمناطق فقط.";
  if(/(?:خصم|تخفيض|كود|قسيمة|discount|coupon)/i.test(text))
    return "لا أؤكد خصمًا أو أصدر كودًا إلا بعد موافقة إدارة RAFIQ على المركز وقيمة الخصم وشروطه. يُعرض فقط الخصم المعتمد رسميًا.";
  if(/(?:واتساب|whatsapp|تواصل|قناة|رقم)/i.test(text))
    return "قنوات RAFIQ الرسمية:\n• بوت Telegram: https://t.me/RAFIQ_Care_Bot\n• قناة Telegram: https://t.me/+a7CDblNyGKw1Yjg8\n• قناة WhatsApp: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K\n• WhatsApp يدويًا: +961 81 506 299 — https://wa.me/96181506299\n• الموقع: https://index-html.issaapplication.workers.dev/";
  return "أهلًا بك في RAFIQ 🌿 دليلنا يشمل المختبرات الطبية، الأشعة والتصوير، العلاج الفيزيائي، وبيع وتأجير المعدات الطبية. اختر فئة الخدمة أو المنطقة، وستظهر المراكز والعروض بعد اعتمادها من الإدارة.";
};
