import { describe, expect, test } from "bun:test";
import { answerRafiqKnowledge, RAFIQ_SERVICE_KNOWLEDGE } from "./rafiq-service-knowledge";

const agentHtml = await Bun.file(new URL("../public/agent.html", import.meta.url)).text();
const homepage = await Bun.file(new URL("../public/index.html", import.meta.url)).text();
const adminHtml = await Bun.file(new URL("../public/admin.html", import.meta.url)).text();
const telegramSource = await Bun.file(new URL("./index.ts", import.meta.url)).text();
const publicIntake = await Bun.file(new URL("../supabase/functions/public-intake/index.ts", import.meta.url)).text();
const applicationIntake = await Bun.file(new URL("../supabase/functions/public-application-intake/index.ts", import.meta.url)).text();

describe("RAFIQ current product scope", () => {
  test("care and nursing requests are not collected or accepted", () => {
    const answer = answerRafiqKnowledge("أريد مقدم رعاية منزلية لوالدتي");
    expect(answer).toContain("لا يوفر RAFIQ");
    expect(answer).toContain("لا يستقبل طلبات حالات");
    expect(RAFIQ_SERVICE_KNOWLEDGE).toContain("لا تستقبل RAFIQ طلبات رعاية منزلية");
  });

  test("provider and institution registration is not accepted", () => {
    const answer = answerRafiqKnowledge("أريد انتساب كمقدم رعاية");
    expect(answer).toContain("لا يستقبل RAFIQ");
    expect(answer).toContain("طلبات انتساب");
  });

  test("CV and Cover Letter remain available", () => {
    const answer = answerRafiqKnowledge("أريد خدمة CV وCover Letter");
    expect(answer).toContain("CV وCover Letter");
    expect(answer).toContain("caregivers.html");
  });

  test("discounts remain case-by-case and management-approved", () => {
    const answer = answerRafiqKnowledge("هل لديكم كود خصم؟");
    expect(answer).toContain("لا توجد نسبة خصم");
    expect(answer).toContain("السعر الفعلي");
    expect(answer).toContain("استخدام واحد");
  });

  test("public assistant has no structured care intake flow", () => {
    expect(agentHtml).not.toContain("function isCare");
    expect(agentHtml).not.toContain("function start(q)");
    expect(agentHtml).not.toContain("function finish()");
    expect(agentHtml).not.toContain("طلب متابعة حالة");
    expect(agentHtml).toContain("خدمة CV وCover Letter");
  });

  test("homepage navigation is directory and CV only", () => {
    expect(homepage).toContain("/laboratories.html");
    expect(homepage).toContain("/radiology.html");
    expect(homepage).toContain("/physiotherapy.html");
    expect(homepage).toContain("/medical-equipment.html");
    expect(homepage).toContain("/caregivers.html#cv-service");
    expect(homepage).not.toContain("/caregiver-work.html");
    expect(homepage).not.toContain("/nursing-work.html");
    expect(homepage).not.toContain("/home-physiotherapy.html");
  });

  test("admin interface retains CV review but removes institution intake review", () => {
    expect(adminHtml).toContain("طلبات CV وCover Letter");
    expect(adminHtml).toContain("admin_approve_application_intake");
    expect(adminHtml).not.toContain("institution_intakes");
    expect(adminHtml).not.toContain("loadInstitutions");
  });

  test("legacy Telegram care-request sessions are no longer created", () => {
    expect(telegramSource).not.toContain("rafiq_telegram_request_sessions");
    expect(telegramSource).not.toContain("natural_care_intake_started");
    expect(telegramSource).not.toContain("request_submitted");
    expect(telegramSource).toContain("submissions_not_supported");
  });

  test("generic public intake endpoint is retired while CV intake is restricted to CV + Cover Letter", () => {
    expect(publicIntake).toContain("status:410");
    expect(applicationIntake).toContain('new Set(["CV + Cover Letter"])');
  });
});
