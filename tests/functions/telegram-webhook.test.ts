import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacyIndex = readFileSync(resolve(import.meta.dir, "../../src/index.ts"), "utf8");
const source = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/telegram-webhook/index.ts"),
  "utf8",
);
const publicIntake = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/public-intake/index.ts"),
  "utf8",
);
const applicationIntake = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/public-application-intake/index.ts"),
  "utf8",
);
const applicationUpload = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/public-application-upload/index.ts"),
  "utf8",
);
const metaWebhook = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/meta-whatsapp-webhook/index.ts"),
  "utf8",
);

test("Telegram webhook fails closed without bot, Supabase, or secret configuration", () => {
  expect(source).toContain("WEBHOOK_SECRET.length < 32");
  expect(source).toContain("x-telegram-bot-api-secret-token");
  expect(source).toContain("safeEqual(receivedSecret, WEBHOOK_SECRET)");
});

test("Telegram webhook keeps atomic idempotency and rate-limit protections", () => {
  expect(source).toContain('rpc("claim_telegram_update"');
  expect(source).toContain('claim.current_status === "completed"');
  expect(source).toContain('return json(200, { ok: true, status: "duplicate_completed" })');
  expect(source).toContain('rpc("consume_telegram_rate_limit"');
  expect(source).toContain('return json(503, { error: "processing_failed_retry" })');
});

test("Telegram bot is an approved medical-centre directory, not an intake form", () => {
  expect(source).toContain("SERVICE_ITEMS");
  expect(source).toContain('labs: "المختبرات الطبية"');
  expect(source).toContain('imaging: "مراكز الأشعة والتصوير الطبي"');
  expect(source).toContain('physio: "مراكز العلاج الفيزيائي"');
  expect(source).toContain('equipment_sale: "مراكز بيع المعدات الطبية"');
  expect(source).toContain('equipment_rent: "مراكز تأجير المعدات الطبية"');
  expect(source).toContain('const AREA_ITEMS = ["طرابلس","الضنية","زغرتا","الكورة","البترون","بيروت","باقي لبنان"]');
  expect(source).toContain('command === "/request"');
  expect(source).toContain("تم إيقاف مسار الطلبات والتقديم عبر البوت");
  expect(source).not.toContain("rafiq_telegram_request_sessions");
  expect(source).not.toContain("application_intakes");
});

test("Public intake and upload functions are retired with HTTP 410", () => {
  for (const functionSource of [publicIntake, applicationIntake, applicationUpload]) {
    expect(functionSource).toContain("status:410");
    expect(functionSource).toContain("public_submission_endpoint_retired");
    expect(functionSource).not.toContain("createClient");
    expect(functionSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  }
});

test("WhatsApp Meta webhook is retired; messaging runtime is Telegram-only", () => {
  expect(metaWebhook).toContain("status:410");
  expect(metaWebhook).not.toContain("META_ACCESS_TOKEN");
  expect(metaWebhook).not.toContain("graph.facebook.com");
  expect(legacyIndex).not.toContain("graph.facebook.com");
  expect(legacyIndex).not.toContain("META_ACCESS_TOKEN");
  expect(legacyIndex).not.toContain("verifyMetaSignature");
  expect(legacyIndex).toContain("WhatsApp automation is retired");
  expect(legacyIndex).toContain("Kapso integration is retired");
  expect(legacyIndex).not.toContain("rafiq_telegram_request_sessions");
});
