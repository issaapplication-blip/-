import { expect, test } from "bun:test";
import { detectRafiqLanguage, getRafiqKnowledgeReply, rafiqUnknownReply } from "../../supabase/functions/_shared/rafiq-knowledge";

const cases = [
  { ar: "ما خدمات رفيق؟", en: "What services do you offer?", arExpected: "خدمات RAFIQ", enExpected: "elderly care" },
  { ar: "أريد رعاية مسن", en: "I need elderly care", arExpected: "رعاية كبار السن", enExpected: "in-home elderly care" },
  { ar: "أحتاج رعاية لمريض", en: "I need patient home care", arExpected: "الرعاية المنزلية للمرضى", enExpected: "home-care requests for patients" },
  { ar: "هل لديكم تمريض منزلي؟", en: "Do you provide home nursing?", arExpected: "التمريض المنزلي", enExpected: "home-nursing requests" },
  { ar: "أريد علاجًا فيزيائيًا", en: "I need physiotherapy", arExpected: "العلاج الفيزيائي المنزلي", enExpected: "home-physiotherapy requests" },
  { ar: "كيف أسجل مختبرًا؟", en: "How can a laboratory register?", arExpected: "المختبرات الطبية", enExpected: "medical laboratories" },
  { ar: "هل تسجلون مراكز الأشعة؟", en: "How do imaging centres register?", arExpected: "مراكز الأشعة", enExpected: "Imaging centres" },
  { ar: "أحتاج معدات طبية", en: "Do you list medical equipment?", arExpected: "المعدات الطبية", enExpected: "Medical-equipment providers" },
  { ar: "كيف أسجل كمقدم رعاية؟", en: "How can I register as a caregiver?", arExpected: "مقدمي الرعاية", enExpected: "Caregivers, nurses" },
  { ar: "هل يمكن للمؤسسات التسجيل؟", en: "Can an institution register?", arExpected: "المختبرات", enExpected: "Medical laboratories" },
  { ar: "كم سعر السيرة الذاتية؟", en: "What are your CV prices?", arExpected: "$25", enExpected: "$25" },
  { ar: "ما أسعار الخدمات؟", en: "How much do your services cost?", arExpected: "لا يوجد سعر موحد", enExpected: "There is no published standard price" },
  { ar: "هل تغطون طرابلس؟", en: "Do you cover Tripoli?", arExpected: "مناطق لبنان", enExpected: "across Lebanon" },
  { ar: "ما ساعات العمل؟", en: "What are your working hours?", arExpected: "لا تنشر المنصة ساعات عمل", enExpected: "does not publish confirmed general office hours" },
  { ar: "كيف تحمون الخصوصية؟", en: "How do you handle privacy?", arExpected: "المعلومات والوثائق", enExpected: "Submitted information" },
  { ar: "كيف أتواصل معكم؟", en: "How can I contact RAFIQ?", arExpected: "WhatsApp", enExpected: "WhatsApp" },
  { ar: "هل لديكم وظائف شاغرة؟", en: "Are there current job vacancies?", arExpected: "لا توجد قائمة وظائف شاغرة", enExpected: "There is no verified public list" },
  { ar: "هل أحتاج إلى حساب للتسجيل؟", en: "Do I need an account to register?", arExpected: "لا تحتاج إلى إنشاء حساب", enExpected: "You do not need to create an account" },
  { ar: "هل تتوفر رعاية 24 ساعة؟", en: "Can I request 24-hour care?", arExpected: "رعاية نهارية أو ليلية أو إقامة", enExpected: "daytime, overnight or live-in" },
  { ar: "هل تشمل الرعاية الطبخ والتنظيف؟", en: "Does care include cooking and cleaning?", arExpected: "الطبخ والتنظيف", enExpected: "Cooking, cleaning" },
  { ar: "هل يوجد اشتراك لمقدمي الرعاية؟", en: "Is there a monthly subscription for caregivers?", arExpected: "لا تفرض RAFIQ اشتراكًا", enExpected: "does not charge caregivers" },
] as const;

test("every supported FAQ returns its approved Arabic and English answer", () => {
  for (const item of cases) {
    const arabic = getRafiqKnowledgeReply(item.ar, "ar");
    const english = getRafiqKnowledgeReply(item.en, "en");
    if (!arabic) throw new Error("Arabic FAQ did not match: " + item.ar);
    if (!english) throw new Error("English FAQ did not match: " + item.en);
    expect(arabic).toContain(item.arExpected);
    expect(english).toContain(item.enExpected);
  }
});

test("CV pricing matches the approved schedule in both languages", () => {
  const ar = getRafiqKnowledgeReply("ما سعر السيرة الذاتية؟", "ar")!;
  const en = getRafiqKnowledgeReply("What are your CV prices?", "en")!;
  for (const amount of ["$25", "$35", "$10", "$16", "$51", "$20", "$28"]) {
    expect(ar).toContain(amount);
    expect(en).toContain(amount);
  }
});

test("emergency questions are routed to emergency services in both languages", () => {
  expect(getRafiqKnowledgeReply("لدي ضيق تنفس", "ar")).toContain("خدمات الطوارئ");
  expect(getRafiqKnowledgeReply("I have chest pain", "en")).toContain("emergency services");
});

test("unknown questions are not guessed and have a human escalation answer", () => {
  expect(getRafiqKnowledgeReply("هل تقدمون خدمة غير مدرجة؟")).toBeNull();
  expect(rafiqUnknownReply("ar")).toContain("غير متوفرة حاليًا");
  expect(rafiqUnknownReply("en")).toContain("not currently available");
});

test("language detection supports Arabic and English", () => {
  expect(detectRafiqLanguage("مرحبًا")).toBe("ar");
  expect(detectRafiqLanguage("Hello")).toBe("en");
});
