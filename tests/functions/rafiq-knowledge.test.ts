import { describe, expect, test } from "bun:test";
import { answerFromKnowledge } from "../../supabase/functions/_shared/rafiq-knowledge";

const cases = [
  ["هل رفيق يقدم خدمات؟", "services", "الخدمات المتاحة"],
  ["أحتاج رعاية لكبير السن", "elderly", "رعاية كبار السن"],
  ["أبحث عن رعاية لمريض في البيت", "patient", "رعاية منزلية"],
  ["أحتاج ممرضًا في المنزل", "nursing", "التمريض المنزلي"],
  ["أحتاج علاجًا فيزيائيًا", "physio", "العلاج الفيزيائي"],
  ["من يمكنه التقديم؟", "provider_eligibility", "أصحاب الاختصاص"],
  ["مقدم الرعاية كيف يقدم؟", "caregiver_apply", "نموذج التقديم"],
  ["الممرض كيف يقدم؟", "nurse_apply", "نموذج التقديم"],
  ["المعالج الفيزيائي كيف يقدم؟", "physio_apply", "نموذج التقديم"],
  ["الطبيب كيف يقدم؟", "doctor_apply", "صفحة الأطباء"],
  ["كيف أقدم طلب انضمام؟", "apply", "اختر الصفحة"],
  ["أريد طلب رعاية لأهلي", "family_request", "طلب رعاية"],
  ["متى ترد الإدارة؟", "followup", "لا أستطيع تأكيد مدة"],
  ["هل التقديم مجاني؟", "free_join", "مجاني"],
  ["كم سعر الخدمة؟", "price", "لا أملك سعرًا"],
  ["هل تقدمون الخدمة في طرابلس؟", "regions", "طرابلس"],
  ["هل يوجد دوام ليلي؟", "schedule", "ليلي"],
  ["هل تم قبول طلبي؟", "approval", "مراجعة الإدارة"],
  ["هل معلوماتي سرية؟", "privacy", "بسرية"],
  ["هل بياناتي تظهر للعامة؟", "sharing", "لا تُعرض"],
  ["كيف أتواصل مع الإدارة؟", "contact", "WhatsApp"],
  ["ما رابط بوت Telegram؟", "telegram", "RAFIQ_Care_Bot"],
  ["هل يرد بوت واتساب تلقائياً؟", "whatsapp_policy", "لا يعمل أي وكيل آلي"],
  ["أريد تقديم شكوى", "complaint", "الشكاوى"],
  ["هل لديكم وظائف شاغرة؟", "jobs", "لا أستطيع تأكيد"],
  ["هل المختبرات متاحة؟", "soon", "قيد الإضافة"],
  ["هل تم تأكيد الحجز؟", "booking", "لا يعني تأكيد"],
  ["مرحبا", "greeting", "أهلًا بك"],
  ["هل تعطيني جرعة دواء؟", "medical", "لا أستطيع تقديم تشخيص"],
  ["هناك حالة اختناق", "emergency", "حالة طارئة"],
] as const;

describe("RAFIQ offline knowledge base — 30 common questions", () => {
  for (const [question, intent, expected] of cases) {
    test(question, () => {
      const result = answerFromKnowledge(question, "ar");
      expect(result.intent).toBe(intent);
      expect(result.reply).toContain(expected);
      expect(result.reply.length).toBeLessThan(650);
    });
  }

  test("answers English questions in English", () => {
    const result = answerFromKnowledge("Who can apply to join?", "en");
    expect(result.language).toBe("en");
    expect(result.reply).toContain("Qualified professionals");
  });

  test("answers French questions in French", () => {
    const result = answerFromKnowledge("Comment postuler comme infirmier ?", "fr");
    expect(result.language).toBe("fr");
    expect(result.reply).toContain("actuellement");
  });


  test("detected English question overrides an Arabic website locale", () => {
    const result = answerFromKnowledge("Who can apply to join?", "ar");
    expect(result.language).toBe("en");
    expect(result.reply).toContain("Qualified professionals");
  });

  test("detected French question overrides an Arabic website locale", () => {
    const result = answerFromKnowledge("Comment postuler comme infirmier ?", "ar");
    expect(result.language).toBe("fr");
    expect(result.reply).toContain("infirmiers");
  });

  test("Arabic is the default for unknown language", () => {
    expect(answerFromKnowledge("???").language).toBe("ar");
  });

  test("unknown questions explicitly say the answer is not known", () => {
    const result = answerFromKnowledge("ما لون مكتب المدير؟");
    expect(result.intent).toBe("unknown");
    expect(result.reply).toContain("لا أعرف");
  });

  test("emergency guidance takes precedence over service questions", () => {
    const result = answerFromKnowledge("أحتاج ممرضًا وهناك اختناق");
    expect(result.intent).toBe("emergency");
    expect(result.reply).toContain("الطوارئ");
  });

  test("medical advice requests are refused safely", () => {
    const result = answerFromKnowledge("ما جرعة الدواء المناسبة؟");
    expect(result.intent).toBe("medical");
    expect(result.reply).toContain("لا أستطيع تقديم");
  });
});
