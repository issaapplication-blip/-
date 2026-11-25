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

type AgentLocale = "ar" | "en" | "fr" | "it" | "de";

const FALLBACK_MESSAGES: Record<AgentLocale, Record<string, string>> = {
  ar: {
    urgent: "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.",
    price: "لا يوجد سعر موحّد أستطيع تأكيده. تتحدد التكلفة بحسب الخدمة والمنطقة والدوام واحتياجات الحالة والتوفر؛ وتؤكد الإدارة السعر قبل أي اتفاق. اكتب /request عبر بوت رفيق لبدء طلب المراجعة.",
    nursing: "نساعد في تنظيم طلب التمريض المنزلي، وتراجع الإدارة المنطقة والمهمة والتوفر. اكتب /request عبر بوت رفيق لبدء الطلب.",
    physio: "نساعد في تنظيم طلب العلاج الفيزيائي المنزلي، وتراجع الإدارة ملاءمة الخدمة والتوفر. اكتب /request عبر بوت رفيق لبدء الطلب.",
    elderly: "رفيق ينظم طلبات رعاية كبار السن داخل المنزل بحسب المنطقة والدوام والتوفر. اكتب /request عبر بوت رفيق لبدء طلب تراجعه الإدارة.",
    patient: "رفيق يساعد في تنظيم طلب رعاية منزلية للمريض؛ وتراجع الإدارة التفاصيل دون تقديم تشخيص أو استبدال الفريق الطبي. اكتب /request عبر بوت رفيق.",
    area: "نستقبل طلبات من مناطق لبنان، ويُراجع التوفر لكل خدمة ومنطقة على حدة. حدّد منطقتك ونوع الخدمة أو ابدأ الطلب عبر بوت رفيق.",
    contact: "للمتابعة الإدارية: WhatsApp +961 81 506 299. بوت رفيق: https://t.me/RAFIQ_Care_Bot. الردود الآلية على WhatsApp ما زالت متوقفة لحين اجتياز اختبار منفصل.",
    generic: "مرحبًا بك في RAFIQ | رفيق 🌿 أساعدك بالمعلومات العامة عن رعاية المسنين والمرضى والتمريض المنزلي والعلاج الفيزيائي. لا أقدم تشخيصًا أو أسعارًا غير مؤكدة. حدّد الخدمة أو استخدم بوت رفيق لتسجيل طلب تراجعه الإدارة."
  },
  en: {
    urgent: "If there is an emergency or immediate danger, contact local emergency services or the treating medical team now. Do not delay urgent care while waiting for RAFIQ.",
    price: "I cannot confirm a single standard price. The cost depends on the service, area, schedule, care needs, and availability. Management confirms the price before any agreement. Use /request in the RAFIQ bot to start a request for review.",
    nursing: "We can organize a home-nursing request. Management reviews the area, required task, and availability. Use /request in the RAFIQ bot to start your request.",
    physio: "We can organize a home-physiotherapy request. Management reviews whether the service is suitable and available. Use /request in the RAFIQ bot to start your request.",
    elderly: "RAFIQ organizes home-care requests for older adults according to the area, schedule, and availability. Use /request in the RAFIQ bot to submit a request for management review.",
    patient: "RAFIQ can organize a home-care request for a patient. Management reviews the details; the platform does not diagnose or replace the treating medical team. Use /request in the RAFIQ bot.",
    area: "We receive requests from across Lebanon. Availability is reviewed separately for each service and area. Tell us your area and the service you need, or start a request through the RAFIQ bot.",
    contact: "For management follow-up: WhatsApp +961 81 506 299. RAFIQ Telegram bot: https://t.me/RAFIQ_Care_Bot. Automatic WhatsApp replies remain disabled until a separate test is completed.",
    generic: "Welcome to RAFIQ 🌿 I can provide general information about elderly care, patient care, home nursing, and home physiotherapy. I cannot diagnose or confirm unverified prices. Tell me which service you need, or use the RAFIQ bot to submit a request for management review."
  },
  fr: {
    urgent: "En cas d’urgence ou de danger immédiat, contactez immédiatement les services d’urgence locaux ou l’équipe médicale qui vous suit. Ne retardez pas les soins urgents en attendant RAFIQ.",
    price: "Je ne peux pas confirmer un tarif unique. Le coût dépend du service, de la zone, des horaires, des besoins et des disponibilités. La direction confirme le tarif avant tout accord. Utilisez /request dans le bot RAFIQ pour soumettre une demande à examiner.",
    nursing: "Nous pouvons organiser une demande de soins infirmiers à domicile. La direction vérifie la zone, l’acte demandé et les disponibilités. Utilisez /request dans le bot RAFIQ pour commencer.",
    physio: "Nous pouvons organiser une demande de kinésithérapie à domicile. La direction vérifie l’adéquation du service et les disponibilités. Utilisez /request dans le bot RAFIQ pour commencer.",
    elderly: "RAFIQ organise les demandes de soins à domicile pour les personnes âgées selon la zone, les horaires et les disponibilités. Utilisez /request dans le bot RAFIQ pour transmettre une demande à la direction.",
    patient: "RAFIQ peut organiser une demande de soins à domicile pour un patient. La direction examine les détails ; la plateforme ne pose pas de diagnostic et ne remplace pas l’équipe médicale. Utilisez /request dans le bot RAFIQ.",
    area: "Nous recevons des demandes de toutes les régions du Liban. Les disponibilités sont vérifiées séparément pour chaque service et chaque zone. Indiquez votre région et le service souhaité, ou commencez une demande via le bot RAFIQ.",
    contact: "Pour le suivi administratif : WhatsApp +961 81 506 299. Bot Telegram RAFIQ : https://t.me/RAFIQ_Care_Bot. Les réponses automatiques WhatsApp restent désactivées jusqu’à la réalisation d’un test distinct.",
    generic: "Bienvenue chez RAFIQ 🌿 Je peux fournir des informations générales sur les soins aux personnes âgées, aux patients, les soins infirmiers à domicile et la kinésithérapie à domicile. Je ne pose pas de diagnostic et ne confirme pas de tarifs non vérifiés. Indiquez le service souhaité ou utilisez le bot RAFIQ pour envoyer une demande à examiner par la direction."
  },
  it: {
    urgent: "In caso di emergenza o pericolo immediato, contatta subito i servizi di emergenza locali o il team medico curante. Non ritardare le cure urgenti aspettando RAFIQ.",
    price: "Non posso confermare un prezzo unico. Il costo dipende dal servizio, dalla zona, dagli orari, dalle esigenze assistenziali e dalla disponibilità. La direzione conferma il prezzo prima di qualsiasi accordo. Usa /request nel bot RAFIQ per avviare una richiesta da verificare.",
    nursing: "Possiamo organizzare una richiesta di assistenza infermieristica domiciliare. La direzione verifica la zona, l’attività richiesta e la disponibilità. Usa /request nel bot RAFIQ per iniziare.",
    physio: "Possiamo organizzare una richiesta di fisioterapia domiciliare. La direzione verifica l’idoneità del servizio e la disponibilità. Usa /request nel bot RAFIQ per iniziare.",
    elderly: "RAFIQ organizza richieste di assistenza domiciliare per anziani in base alla zona, agli orari e alla disponibilità. Usa /request nel bot RAFIQ per inviare una richiesta alla direzione.",
    patient: "RAFIQ può organizzare una richiesta di assistenza domiciliare per un paziente. La direzione esamina i dettagli; la piattaforma non formula diagnosi e non sostituisce il team medico. Usa /request nel bot RAFIQ.",
    area: "Accettiamo richieste da tutte le aree del Libano. La disponibilità viene verificata separatamente per ogni servizio e zona. Indica la tua zona e il servizio necessario oppure avvia una richiesta tramite il bot RAFIQ.",
    contact: "Per il seguito amministrativo: WhatsApp +961 81 506 299. Bot Telegram RAFIQ: https://t.me/RAFIQ_Care_Bot. Le risposte automatiche su WhatsApp restano disattivate fino al completamento di un test separato.",
    generic: "Benvenuto in RAFIQ 🌿 Posso fornire informazioni generali sull’assistenza agli anziani e ai pazienti, sull’infermieristica domiciliare e sulla fisioterapia a domicilio. Non formulo diagnosi e non confermo prezzi non verificati. Indica il servizio necessario oppure usa il bot RAFIQ per inviare una richiesta alla direzione."
  },
  de: {
    urgent: "Bei einem Notfall oder unmittelbarer Gefahr wenden Sie sich sofort an den örtlichen Rettungsdienst oder das behandelnde medizinische Team. Warten Sie nicht auf RAFIQ, bevor Sie dringende Hilfe in Anspruch nehmen.",
    price: "Ich kann keinen einheitlichen Preis bestätigen. Die Kosten hängen von Leistung, Gebiet, Zeitplan, Betreuungsbedarf und Verfügbarkeit ab. Die Leitung bestätigt den Preis vor jeder Vereinbarung. Verwenden Sie /request im RAFIQ-Bot, um eine Anfrage zur Prüfung zu senden.",
    nursing: "Wir können eine Anfrage für häusliche Krankenpflege organisieren. Die Leitung prüft Gebiet, benötigte Tätigkeit und Verfügbarkeit. Verwenden Sie /request im RAFIQ-Bot, um die Anfrage zu starten.",
    physio: "Wir können eine Anfrage für Physiotherapie zu Hause organisieren. Die Leitung prüft die Eignung der Leistung und die Verfügbarkeit. Verwenden Sie /request im RAFIQ-Bot, um die Anfrage zu starten.",
    elderly: "RAFIQ organisiert Anfragen zur häuslichen Betreuung älterer Menschen je nach Gebiet, Zeitplan und Verfügbarkeit. Verwenden Sie /request im RAFIQ-Bot, um eine Anfrage zur Prüfung durch die Leitung zu senden.",
    patient: "RAFIQ kann eine Anfrage zur häuslichen Betreuung eines Patienten organisieren. Die Leitung prüft die Angaben; die Plattform stellt keine Diagnosen und ersetzt nicht das behandelnde medizinische Team. Verwenden Sie /request im RAFIQ-Bot.",
    area: "Wir nehmen Anfragen aus allen Regionen des Libanon entgegen. Die Verfügbarkeit wird für jede Leistung und jedes Gebiet einzeln geprüft. Nennen Sie Ihr Gebiet und die gewünschte Leistung oder starten Sie eine Anfrage über den RAFIQ-Bot.",
    contact: "Für die administrative Rückmeldung: WhatsApp +961 81 506 299. RAFIQ-Telegram-Bot: https://t.me/RAFIQ_Care_Bot. Automatische WhatsApp-Antworten bleiben deaktiviert, bis ein separater Test abgeschlossen ist.",
    generic: "Willkommen bei RAFIQ 🌿 Ich kann allgemeine Informationen zur Betreuung älterer Menschen und von Patienten, zur häuslichen Krankenpflege und zur Physiotherapie zu Hause geben. Ich stelle keine Diagnosen und bestätige keine ungeprüften Preise. Nennen Sie die gewünschte Leistung oder nutzen Sie den RAFIQ-Bot, um eine Anfrage zur Prüfung durch die Leitung zu senden."
  }
};

const LANGUAGE_INSTRUCTIONS: Record<AgentLocale, string> = {
  ar: "أجب بالعربية الواضحة والمبسطة.",
  en: "Respond in clear, concise English.",
  fr: "Répondez en français clair et concis.",
  it: "Rispondi in italiano chiaro e conciso.",
  de: "Antworte in klarem, prägnantem Deutsch."
};

function fallback(text: string, locale: AgentLocale = "ar"): string {
  const t = normalize(text);
  let key: keyof typeof FALLBACK_MESSAGES.ar = "generic";
  if (/(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t)) key = "urgent";
  else if (/(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t)) key = "price";
  else if (/(تمريض|ممرض|ممرضة|حقن|ضماد|جرح)/.test(t)) key = "nursing";
  else if (/(فيزيائي|طبيعي|فيزيو|physio)/.test(t)) key = "physio";
  else if (/(مسن|كبار السن|كبير السن|مرافق|رعاية منزلية)/.test(t)) key = "elderly";
  else if (/(مريض|مريضة|بعد المستشفى|بعد عملية|رعاية المريض)/.test(t)) key = "patient";
  else if (/(منطقة|وين|اين|تغطية|لبنان|طرابلس|الضنيه|زغرتا|الكوره|البترون|بيروت)/.test(t)) key = "area";
  else if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام|رقم الاداره)/.test(t)) key = "contact";
  return FALLBACK_MESSAGES[locale][key] || FALLBACK_MESSAGES.ar[key];
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12_000) return json(413, { ok: false, error: "message_too_large" });
  let body: unknown;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const payload = body as { message?: unknown; locale?: unknown };
  const candidate = payload?.message;
  if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 4000) {
    return json(400, { ok: false, error: "invalid_message" });
  }
  const requestedLocale = typeof payload.locale === "string"
    ? payload.locale.trim().toLowerCase().split("-")[0]
    : "ar";
  const locale: AgentLocale = (["ar", "en", "fr", "it", "de"].includes(requestedLocale) ? requestedLocale : "ar") as AgentLocale;
  const safeMessage = redactPhones(candidate);
  const immediate = fallback(safeMessage, locale);
  const t = normalize(safeMessage);
  const urgent = /(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t);
  if (!env.AI || urgent || /(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t)) {
    return json(200, { ok: true, reply: immediate, model: "guided-fallback" });
  }
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "أنت مساعد المعلومات العامة لمنصة RAFIQ | رفيق للرعاية المنزلية في لبنان. خدمات المنصة: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، العلاج الفيزيائي المنزلي، وتلقي طلبات المختبرات/التصوير/المعدات من الجهات. لا تشخّص، ولا تصف دواء، ولا تقدم تعليمات علاجية، ولا تخترع أسعارًا أو توفرًا أو حجوزات أو تراخيص أو شراكات. لا تطلب بيانات صحية تفصيلية، هوية، كلمات مرور، رموز تحقق أو أرقام هواتف. في الطوارئ، وجّه المستخدم إلى الطوارئ المحلية/الفريق الطبي. وضّح أن أي طلب يُراجع من الإدارة ولا يعني تأكيد الحجز. إذا لم تعرف الإجابة، قل ذلك وقدّم طريقة التواصل الإداري. " + LANGUAGE_INSTRUCTIONS[locale] },
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
