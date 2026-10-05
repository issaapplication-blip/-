export const CV_PRICING = {
  cv: { promo: 25, regular: 35 },
  cover: { promo: 10, regular: 16 },
  bundle: { promo: 35, regular: 51 },
  extraLanguage: { promo: 20, regular: 28 },
} as const;

export const CV_PAYMENT_WALLET = "70 600 157";
export const CV_PAYMENT_METHOD = "Whish Money 🇱🇧";

export const cvMenuText = () => [
  "📄 خدمات CV و Cover Letter | RAFIQ 🇱🇧",
  "",
  "1️⃣ CV احترافي — $25 بدل $35",
  "2️⃣ Cover Letter — $10 بدل $16",
  "3️⃣ CV + Cover Letter — $35 بدل $51",
  "🌍 لغة إضافية للـCV — +$20 بدل +$28",
  "",
  "يشمل CV: العربية 🇱🇧 + الإنجليزية 🇬🇧، PDF + Word، تصميم مهني، مراجعة لغوية وتنسيقية، وتحسين قابلية القراءة بواسطة ATS مع تخصيص المحتوى حسب الوظيفة.",
  "",
  "للبدء اكتب: CV أو اختر 1 / 2 / 3."
].join("\n");

export const cvPaymentText = (amount: number) => [
  "💳 الدفع قبل التسليم النهائي",
  "",
  "المبلغ المطلوب: $" + amount,
  "طريقة الدفع: " + CV_PAYMENT_METHOD,
  "رقم المحفظة: " + CV_PAYMENT_WALLET,
  "",
  "بعد التحويل أرسل صورة/ملف إثبات الدفع هنا.",
  "⚠️ لا ترسل كلمة مرور Whish أو رمز OTP.",
  "سيبقى الطلب «بانتظار تأكيد الدفع» إلى أن تراجعه إدارة رفيق. لا يتم تسليم النسخة النهائية قبل التأكيد."
].join("\n");

export function cvChoice(text: string): {service:string; amount:number}|null {
  const t=text.trim().toLowerCase();
  if(t==="1" || /cv(?!.*cover)|سيرة/.test(t)) return {service:"cv",amount:25};
  if(t==="2" || /cover\s*letter|رسالة/.test(t)) return {service:"cover",amount:10};
  if(t==="3" || /cv.*cover|bundle|باقة/.test(t)) return {service:"bundle",amount:35};
  return null;
}

export const cvPrompt = (step: string) => {
  const prompts: Record<string,string> = {
    name:"ما اسمك الكامل؟",
    target:"ما الوظيفة أو المجال الذي تريد التقديم عليه؟",
    experience:"اذكر باختصار خبرتك أو آخر وظيفة عملت بها.",
    languages:"هل تريد لغة إضافية للـCV غير العربية والإنجليزية؟ اكتب اللغة أو «لا».",
    oldcv:"إذا لديك CV قديم أو ملف مهني، أرسله هنا. وإن لم يكن لديك ملف، اكتب «لا يوجد».",
  };
  return prompts[step] ?? prompts.name;
};
