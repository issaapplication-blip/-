interface AIResult {
  response?: string;
  result?: { response?: string };
}

interface Env {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<AIResult | string>;
  };
}

function json(status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalize(text: string): string {
  return text.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function redactPhones(text: string): string {
  return text
    .replace(/(?:\+?961[\s().-]*0?[\s().-]*[1-9](?:[\s().-]*\d){6,7})/g, "[رقم محجوب]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[رقم محجوب]")
    .slice(0, 1500);
}

function fallback(text: string): string {
  const t = normalize(text);
  if (/(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t)) {
    return "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.";
  }
  if (/(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t)) {
    return "لا يوجد سعر موحّد أستطيع تأكيده. تتحدد التكلفة بحسب الخدمة والمنطقة والدوام واحتياجات الحالة والتوفر؛ وتؤكد الإدارة السعر قبل أي اتفاق. اكتب /request عبر بوت رفيق لبدء طلب المراجعة.";
  }
  if (/(تمريض|ممرض|ممرضة|حقن|ضماد|جرح)/.test(t)) {
    return "نساعد في تنظيم طلب التمريض المنزلي، وتراجع الإدارة المنطقة والمهمة والتوفر. اكتب /request عبر بوت رفيق لبدء الطلب.";
  }
  if (/(فيزيائي|طبيعي|فيزيو|physio)/.test(t)) {
    return "نساعد في تنظيم طلب العلاج الفيزيائي المنزلي، وتراجع الإدارة ملاءمة الخدمة والتوفر. اكتب /request عبر بوت رفيق لبدء الطلب.";
  }
  if (/(مسن|كبار السن|كبير السن|مرافق|رعاية منزلية)/.test(t)) {
    return "رفيق ينظم طلبات رعاية كبار السن داخل المنزل بحسب المنطقة والدوام والتوفر. اكتب /request عبر بوت رفيق لبدء طلب تراجعه الإدارة.";
  }
  if (/(مريض|مريضة|بعد المستشفى|بعد عملية|رعاية المريض)/.test(t)) {
    return "رفيق يساعد في تنظيم طلب رعاية منزلية للمريض؛ وتراجع الإدارة التفاصيل دون تقديم تشخيص أو استبدال الفريق الطبي. اكتب /request عبر بوت رفيق.";
  }
  if (/(منطقة|وين|اين|تغطية|لبنان|طرابلس|الضنيه|زغرتا|الكوره|البترون|بيروت)/.test(t)) {
    return "نستقبل طلبات من مناطق لبنان، ويُراجع التوفر لكل خدمة ومنطقة على حدة. حدّد منطقتك ونوع الخدمة أو ابدأ الطلب عبر بوت رفيق.";
  }
  if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام|رقم الاداره)/.test(t)) {
    return "للمتابعة الإدارية: WhatsApp +961 81 506 299. بوت رفيق: https://t.me/RAFIQ_Care_Bot. الردود الآلية على WhatsApp ما زالت متوقفة لحين اجتياز اختبار منفصل.";
  }
  return "مرحبًا بك في RAFIQ | رفيق 🌿 أساعدك بالمعلومات العامة عن رعاية المسنين والمرضى والتمريض المنزلي والعلاج الفيزيائي. لا أقدم تشخيصًا أو أسعارًا غير مؤكدة. حدّد الخدمة أو استخدم بوت رفيق لتسجيل طلب تراجعه الإدارة.";
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12_000) return json(413, { ok: false, error: "message_too_large" });
  let body: unknown;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const candidate = (body as { message?: unknown })?.message;
  if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 4000) {
    return json(400, { ok: false, error: "invalid_message" });
  }
  const safeMessage = redactPhones(candidate);
  const immediate = fallback(safeMessage);
  const t = normalize(safeMessage);
  const urgent = /(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t);
  if (!env.AI || urgent || /(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t)) {
    return json(200, { ok: true, reply: immediate, model: "guided-fallback" });
  }
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "أنت مساعد المعلومات العامة لمنصة RAFIQ | رفيق للرعاية المنزلية في لبنان. أجب بالعربية الواضحة باختصار. خدمات المنصة: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، العلاج الفيزيائي المنزلي، وتلقي طلبات المختبرات/التصوير/المعدات من الجهات. لا تشخّص، ولا تصف دواء، ولا تقدم تعليمات علاجية، ولا تخترع أسعارًا أو توفرًا أو حجوزات أو تراخيص أو شراكات. لا تطلب بيانات صحية تفصيلية، هوية، كلمات مرور، رموز تحقق أو أرقام هواتف. في الطوارئ، وجّه المستخدم إلى الطوارئ المحلية/الفريق الطبي. وضّح أن أي طلب يُراجع من الإدارة ولا يعني تأكيد الحجز. إذا لم تعرف الإجابة، قل ذلك وقدّم طريقة التواصل الإداري." },
        { role: "user", content: safeMessage },
      ],
      max_tokens: 300,
      temperature: 0.2,
    });
    const answer = typeof result === "string" ? result : (result?.response || result?.result?.response || "");
    if (!String(answer).trim()) return json(200, { ok: true, reply: immediate, model: "guided-fallback" });
    return json(200, { ok: true, reply: String(answer).trim().slice(0, 2500), model: "cloudflare-workers-ai" });
  } catch {
    return json(200, { ok: true, reply: immediate, model: "guided-fallback" });
  }
};
