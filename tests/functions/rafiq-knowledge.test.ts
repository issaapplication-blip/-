import { expect, test } from "bun:test";
import { detectRafiqLanguage, getRafiqKnowledgeReply, rafiqUnknownReply } from "../../supabase/functions/_shared/rafiq-knowledge";

const cases = [
  ["ما خدمات رفيق؟", "services"],
  ["أريد رعاية مسن", "elderly"],
  ["أحتاج رعاية لمريض", "patient"],
  ["هل لديكم تمريض منزلي؟", "nursing"],
  ["أريد علاجًا فيزيائيًا", "physio"],
  ["كيف أسجل مختبرًا؟", "labs"],
  ["هل تسجلون مراكز الأشعة؟", "imaging"],
  ["أحتاج معدات طبية", "equipment"],
  ["كيف أسجل كمقدم رعاية؟", "provider"],
  ["هل يمكن للمؤسسات التسجيل؟", "institution"],
  ["كم سعر السيرة الذاتية؟", "cv"],
  ["ما أسعار الخدمات؟", "price"],
  ["هل تغطون طرابلس؟", "areas"],
  ["ما ساعات العمل؟", "hours"],
  ["كيف تحمون الخصوصية؟", "privacy"],
  ["كيف أتواصل معكم؟", "contact"],
  ["I need elderly care", "elderly"],
  ["I need patient home care", "patient"],
  ["Do you provide home nursing?", "nursing"],
  ["I need physiotherapy", "physio"],
  ["How can a laboratory register?", "labs"],
  ["How do imaging centres register?", "imaging"],
  ["Do you list medical equipment?", "equipment"],
  ["How can I register as a caregiver?", "provider"],
  ["Can an institution register?", "institution"],
  ["What are your CV prices?", "cv"],
  ["How much do your services cost?", "price"],
  ["Do you cover Tripoli?", "areas"],
  ["What are your working hours?", "hours"],
  ["How do you handle privacy?", "privacy"],
  ["How can I contact RAFIQ?", "contact"],
] as const;

test("RAFIQ shared knowledge answers every supported FAQ in Arabic and English", () => {
  for (const [question] of cases) {
    const answer = getRafiqKnowledgeReply(question);
    expect(answer).toBeTruthy();
    expect(answer).not.toContain("rafiq.pages.dev");
  }
});

test("knowledge intent replies are consistent across language variants", () => {
  const ar = getRafiqKnowledgeReply("ما سعر السيرة الذاتية؟");
  const en = getRafiqKnowledgeReply("What are your CV prices?");
  expect(ar).toContain("$25");
  expect(ar).toContain("$35");
  expect(ar).toContain("$10");
  expect(ar).toContain("$16");
  expect(en).toContain("$25");
  expect(en).toContain("$51");
});

test("emergency questions are routed to emergency services in both languages", () => {
  expect(getRafiqKnowledgeReply("لدي ضيق تنفس")).toContain("خدمات الطوارئ");
  expect(getRafiqKnowledgeReply("I have chest pain")).toContain("emergency services");
});

test("unknown questions are not guessed and are escalated to a human", () => {
  expect(getRafiqKnowledgeReply("هل تقدمون خدمة غير مدرجة؟")).toBeNull();
  expect(rafiqUnknownReply("ar")).toContain("غير متوفرة حاليًا");
  expect(rafiqUnknownReply("en")).toContain("not currently available");
});

test("language detection supports Arabic and English", () => {
  expect(detectRafiqLanguage("مرحبًا")).toBe("ar");
  expect(detectRafiqLanguage("Hello")).toBe("en");
});
