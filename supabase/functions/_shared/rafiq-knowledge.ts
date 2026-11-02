export type AgentLanguage = "ar" | "en" | "fr";
export type KnowledgeResult = { reply: string; language: AgentLanguage; intent: string; matched: boolean };

const normalize = (value: string) => value.normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
  .replace(/\s+/g, " ").trim().toLowerCase();

export function detectLanguage(text: string): AgentLanguage {
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/\b(bonjour|merci|soins|infirmier|infirmière|personne âgée|comment|services|adhésion|confidentialité)\b|[àâçéèêëîïôùûüÿœ]/i.test(text)) return "fr";
  if (/\b(hello|hi|care|nurse|caregiver|physiotherapy|privacy|apply|services|thank you|how)\b/i.test(text)) return "en";
  return "ar";
}

const replies: Record<string, Record<AgentLanguage, string>> = {
  emergency: {
    ar: "هذه قد تكون حالة طارئة. اتصل فورًا بخدمات الطوارئ المحلية أو توجّه إلى أقرب قسم طوارئ. لا تنتظر رد رفيق.",
    en: "This may be an emergency. Contact local emergency services or go to the nearest emergency department now. Do not wait for RAFIQ.",
    fr: "Cela peut être une urgence. Contactez immédiatement les services d’urgence locaux ou rendez-vous au service d’urgence le plus proche. N’attendez pas RAFIQ."
  },
  medical: {
    ar: "لا أستطيع تقديم تشخيص أو نصيحة علاجية أو تحديد دواء أو جرعة. يرجى مراجعة الطبيب أو الفريق الطبي المعالج. يمكنني توضيح خدمات رفيق فقط.",
    en: "I cannot diagnose, recommend treatment, or specify medication or dosage. Please consult a doctor or your treating medical team. I can explain RAFIQ’s services only.",
    fr: "Je ne peux pas poser de diagnostic ni recommander un traitement, un médicament ou une dose. Consultez un médecin ou votre équipe soignante. Je peux uniquement présenter les services de RAFIQ."
  },
  greeting: {
    ar: "أهلًا بك في رفيق 🌿 كيف يمكنني مساعدتك؟ يمكنني توضيح الخدمات أو طريقة تقديم الطلب.",
    en: "Welcome to RAFIQ 🌿 How can I help? I can explain our services or how to submit a request.",
    fr: "Bienvenue chez RAFIQ 🌿 Comment puis-je vous aider ? Je peux présenter nos services ou expliquer comment envoyer une demande."
  },
  services: {
    ar: "الخدمات المتاحة ضمن رفيق: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، والعلاج الفيزيائي المنزلي. تُراجع الإدارة ملاءمة الخدمة وتوفرها لكل طلب.",
    en: "RAFIQ currently supports requests for elderly care, patient care, home nursing, and home physiotherapy. The administration reviews suitability and availability for each request.",
    fr: "RAFIQ reçoit actuellement des demandes pour l’accompagnement des personnes âgées, les soins aux patients, les soins infirmiers à domicile et la kinésithérapie à domicile. L’administration examine chaque demande et la disponibilité."
  },
  elderly: {
    ar: "نستقبل طلبات رعاية كبار السن في المنزل. اذكر المنطقة ونوع المرافقة المطلوبة، مثل النهار أو الليل أو الإقامة، لتراجع الإدارة الطلب.",
    en: "We accept requests for elderly care at home. Share the area and the preferred arrangement, such as daytime, overnight, or live-in, for administrative review.",
    fr: "Nous recevons des demandes d’accompagnement des personnes âgées à domicile. Indiquez la région et le type de présence souhaité (journée, nuit ou présence continue) pour examen."
  },
  patient: {
    ar: "يمكنك تقديم طلب رعاية منزلية لمريض. اذكر المنطقة ونوع المساعدة اليومية المطلوبة؛ ولا يحل ذلك محل متابعة الطبيب أو المستشفى.",
    en: "You can submit a home-care request for a patient. Share the area and the type of daily support needed. This does not replace care from a doctor or hospital.",
    fr: "Vous pouvez envoyer une demande d’accompagnement à domicile pour un patient. Précisez la région et l’aide quotidienne souhaitée. Cela ne remplace pas le suivi médical."
  },
  nursing: {
    ar: "رفيق يستقبل طلبات التمريض المنزلي، وتُراجع المهام المطلوبة من الإدارة مع مراعاة مؤهلات مقدم الخدمة. ابدأ من صفحة الممرضين أو نموذج طلب الرعاية.",
    en: "RAFIQ accepts home-nursing requests. The administration reviews the requested tasks and the provider’s qualifications. Start from the Nurses page or the care-request form.",
    fr: "RAFIQ reçoit des demandes de soins infirmiers à domicile. L’administration examine les tâches demandées et les qualifications du professionnel. Utilisez la page Infirmiers ou le formulaire de demande."
  },
  physio: {
    ar: "يمكنك طلب العلاج الفيزيائي المنزلي. اذكر المنطقة وطبيعة الخدمة المطلوبة، ويُراجع الاختصاصي والإدارة التفاصيل والتوفر.",
    en: "You can request home physiotherapy. Share the area and the service needed; the professional team and administration review the details and availability.",
    fr: "Vous pouvez demander une séance de kinésithérapie à domicile. Indiquez la région et le service souhaité ; l’équipe compétente et l’administration examineront la demande."
  },
  provider_eligibility: {
    ar: "يمكن لأصحاب الاختصاص والخبرة ذات الصلة تقديم طلب انضمام، مثل الممرضين والممرضات المؤهلين، ومقدمي الرعاية، والمعالجين الفيزيائيين، والأطباء. تُراجع المؤهلات والوثائق قبل اعتماد أي طلب.",
    en: "Qualified professionals with relevant experience may apply, including nurses, caregivers, physiotherapists, and doctors. Qualifications and documents are reviewed before any approval.",
    fr: "Les professionnels qualifiés ayant une expérience pertinente peuvent postuler : infirmiers, aidants, kinésithérapeutes et médecins. Les qualifications et documents sont examinés avant toute approbation."
  },
  caregiver_apply: {
    ar: "يمكن لمقدم الرعاية تعبئة نموذج التقديم المخصص، وذكر الخبرة والمناطق المتاحة وإرفاق الوثائق المطلوبة. إرسال الطلب لا يعني القبول؛ تراجعه الإدارة أولًا.",
    en: "Caregivers can complete the dedicated application form, describe their experience and available areas, and provide the requested documents. Submission does not guarantee acceptance; the administration reviews it first.",
    fr: "Les aidants peuvent remplir le formulaire dédié, décrire leur expérience et leurs régions disponibles, puis joindre les documents demandés. L’envoi ne garantit pas l’acceptation ; l’administration examine d’abord le dossier."
  },
  nurse_apply: {
    ar: "يمكن للممرض أو الممرضة استخدام نموذج التقديم الخاص بالتمريض وإدخال بيانات المؤهلات والترخيص والخبرة. لا يتم اعتماد الطلب قبل المراجعة.",
    en: "Nurses can use the nursing application form to provide qualification, license, and experience details. Applications are not approved before review.",
    fr: "Les infirmiers peuvent utiliser le formulaire dédié pour indiquer leurs diplômes, autorisations et expériences. Aucune candidature n’est approuvée avant examen."
  },
  physio_apply: {
    ar: "يمكن للمعالج الفيزيائي تعبئة نموذج التقديم المخصص وإضافة المؤهلات والترخيص والخبرة ومناطق العمل. تخضع المعلومات للمراجعة.",
    en: "Physiotherapists can complete the dedicated application form with qualifications, license, experience, and work areas. Submitted information is reviewed.",
    fr: "Les kinésithérapeutes peuvent remplir le formulaire dédié en indiquant leurs diplômes, autorisations, expériences et zones d’activité. Les informations sont examinées."
  },
  doctor_apply: {
    ar: "يمكن للأطباء تقديم طلب عبر صفحة الأطباء وإرفاق بيانات الاختصاص والمؤهلات والترخيص المهني. القبول النهائي للإدارة بعد التحقق.",
    en: "Doctors can apply through the Doctors page and provide specialty, qualifications, and professional license details. Final approval follows administrative verification.",
    fr: "Les médecins peuvent postuler via la page Médecins et fournir leur spécialité, leurs diplômes et leur autorisation professionnelle. L’approbation finale dépend de la vérification administrative."
  },
  apply: {
    ar: "اختر الصفحة المناسبة لاختصاصك، املأ النموذج بالمعلومات الصحيحة، وأرسل الطلب للمراجعة. لا يُعد الإرسال قبولًا أو تعاقدًا؛ تتواصل الإدارة بعد مراجعة الطلب.",
    en: "Choose the page for your profession, complete the form with accurate information, and submit it for review. Submission is not acceptance or a contract; the administration follows up after review.",
    fr: "Choisissez la page correspondant à votre profession, remplissez le formulaire avec des informations exactes et envoyez-le pour examen. L’envoi ne vaut ni acceptation ni contrat ; l’administration vous recontactera après examen."
  },
  family_request: {
    ar: "لطلب رعاية لأحد أفراد الأسرة، استخدم نموذج «طلب رعاية لأهلي»، واذكر نوع الخدمة والمنطقة ووسيلة التواصل المناسبة. تراجع الإدارة الطلب قبل التواصل.",
    en: "To request care for a family member, use the “Care for My Family” form and provide the service, area, and preferred contact method. The administration reviews the request before contacting you.",
    fr: "Pour demander un accompagnement pour un proche, utilisez le formulaire « Demander des soins pour ma famille » et indiquez le service, la région et le moyen de contact souhaité. L’administration examine la demande avant de vous contacter."
  },
  followup: {
    ar: "تصل الطلبات إلى الإدارة للمراجعة. لا أستطيع تأكيد مدة محددة للرد؛ إذا كان لديك رقم طلب، أرسله للإدارة للمتابعة.",
    en: "Requests are sent to the administration for review. I cannot promise a specific response time. If you have a request number, share it with the administration for follow-up.",
    fr: "Les demandes sont transmises à l’administration pour examen. Je ne peux pas garantir un délai précis. Si vous avez un numéro de demande, communiquez-le à l’administration pour le suivi."
  },
  free_join: {
    ar: "تقديم طلب الانضمام إلى شبكة مقدمي الخدمات في رفيق مجاني؛ لا توجد رسوم لتقديم الطلب أو لمجرد مراجعته. لا تدفع لأي شخص مقابل قبول الطلب.",
    en: "Applying to join RAFIQ’s provider network is free. There is no fee to submit or review an application. Do not pay anyone for application approval.",
    fr: "La candidature pour rejoindre le réseau de prestataires RAFIQ est gratuite. Aucun frais n’est demandé pour déposer ou examiner une candidature. Ne payez personne pour obtenir une approbation."
  },
  price: {
    ar: "لا أملك سعرًا نهائيًا موثوقًا. تختلف التكلفة بحسب الخدمة والمنطقة والدوام واحتياجات الطلب، وتؤكد الإدارة أي تفاصيل قبل الاتفاق. لا تحول أي مبلغ بناءً على رد آلي.",
    en: "I do not have a verified final price. Costs depend on the service, area, schedule, and request details. The administration confirms any terms before an agreement. Do not transfer money based on an automated reply.",
    fr: "Je ne dispose pas d’un tarif final vérifié. Le coût dépend du service, de la région, des horaires et de la demande. L’administration confirme les conditions avant tout accord. N’effectuez aucun paiement sur la base d’une réponse automatique."
  },
  regions: {
    ar: "تستقبل رفيق طلبات من مناطق لبنانية متعددة، منها طرابلس والضنية وزغرتا والكورة والبترون وبيروت ومناطق أخرى. يُراجع توفر كل خدمة بحسب المنطقة.",
    en: "RAFIQ receives requests from several areas in Lebanon, including Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut, and other areas. Availability is reviewed by service and location.",
    fr: "RAFIQ reçoit des demandes de plusieurs régions du Liban, notamment Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beyrouth et d’autres régions. La disponibilité est vérifiée selon le service et le lieu."
  },
  schedule: {
    ar: "يمكنك توضيح ما إذا كنت تحتاج إلى خدمة نهارية أو ليلية أو إقامة، لكن توفر الدوام يُؤكد بعد مراجعة الإدارة للطلب.",
    en: "You can specify daytime, overnight, or live-in support. The schedule is confirmed only after the administration reviews the request.",
    fr: "Vous pouvez préciser si vous souhaitez une présence de jour, de nuit ou continue. Les horaires ne sont confirmés qu’après examen de la demande par l’administration."
  },
  approval: {
    ar: "كل طلب انضمام يخضع لمراجعة الإدارة والتحقق من المعلومات والوثائق. لا أستطيع تأكيد القبول قبل صدور قرار رسمي.",
    en: "Every provider application is reviewed by the administration, including the information and documents. I cannot confirm acceptance before an official decision.",
    fr: "Chaque candidature est examinée par l’administration, y compris les informations et documents. Je ne peux pas confirmer l’acceptation avant une décision officielle."
  },
  privacy: {
    ar: "نتعامل مع بيانات الطلب بسرية، وتُستخدم لمراجعته والتواصل بشأنه فقط وفق إجراءات المنصة. لا ترسل كلمات مرور أو رموز تحقق أو تفاصيل طبية غير ضرورية.",
    en: "Request information is handled confidentially and used to review the request and follow up under the platform’s procedures. Do not send passwords, verification codes, or unnecessary medical details.",
    fr: "Les informations de demande sont traitées de manière confidentielle et utilisées pour examiner la demande et assurer le suivi selon les procédures de la plateforme. N’envoyez pas de mots de passe, de codes de vérification ni de détails médicaux inutiles."
  },
  sharing: {
    ar: "لا تُعرض بيانات الطلبات الشخصية للعامة. يطّلع عليها المخولون من الإدارة بالقدر اللازم لمراجعة الطلب.",
    en: "Personal request details are not displayed publicly. Authorized administrators access only what is needed to review the request.",
    fr: "Les détails personnels des demandes ne sont pas affichés publiquement. Seuls les administrateurs autorisés y accèdent dans la mesure nécessaire à leur examen."
  },
  contact: {
    ar: "للتواصل مع الإدارة يمكنك استخدام صفحة التواصل أو قناة WhatsApp الرسمية: https://wa.me/96181506299. رسائل WhatsApp الواردة تُحوّل إلى المدير في Telegram، والرد عليها يدوي.",
    en: "You can contact the administration through the contact page or the official WhatsApp contact: https://wa.me/96181506299. Incoming WhatsApp messages are relayed to the manager on Telegram; replies are manual.",
    fr: "Vous pouvez contacter l’administration via la page de contact ou le contact WhatsApp officiel : https://wa.me/96181506299. Les messages WhatsApp entrants sont transférés au responsable sur Telegram ; les réponses sont manuelles."
  },
  telegram: {
    ar: "يمكنك استخدام بوت رفيق على Telegram: https://t.me/RAFIQ_Care_Bot أو متابعة القناة الرسمية: https://t.me/+a7CDblNyGKw1Yjg8.",
    en: "You can use the RAFIQ Telegram bot at https://t.me/RAFIQ_Care_Bot or follow the official channel at https://t.me/+a7CDblNyGKw1Yjg8.",
    fr: "Vous pouvez utiliser le bot Telegram RAFIQ : https://t.me/RAFIQ_Care_Bot ou suivre la chaîne officielle : https://t.me/+a7CDblNyGKw1Yjg8."
  },
  whatsapp_policy: {
    ar: "لا يعمل أي وكيل آلي على WhatsApp ولا يرسل رفيق ردودًا تلقائية هناك. تُحوّل الرسائل الواردة إلى المدير في Telegram، ويتولى المدير الرد بنفسه من WhatsApp.",
    en: "No automated agent operates on WhatsApp and RAFIQ sends no automated WhatsApp replies. Incoming messages are forwarded to the manager on Telegram, who replies manually through WhatsApp.",
    fr: "Aucun agent automatisé ne fonctionne sur WhatsApp et RAFIQ n’y envoie aucune réponse automatique. Les messages entrants sont transférés au responsable sur Telegram, qui répond manuellement via WhatsApp."
  },
  complaint: {
    ar: "أعتذر عن أي تجربة غير مرضية. لا أستطيع البت في الشكاوى؛ أرسل تفاصيل مختصرة ورقم الطلب إلى الإدارة لمراجعتها.",
    en: "I’m sorry to hear about your experience. I cannot decide complaints. Please send a short description and your request number to the administration for review.",
    fr: "Je suis désolé de votre expérience. Je ne peux pas trancher une réclamation. Envoyez une brève description et votre numéro de demande à l’administration pour examen."
  },
  jobs: {
    ar: "يمكنك التقديم إلى فرص مقدمي الخدمات عبر صفحات الاختصاص المناسبة. أما الوظائف أو الشواغر غير المنشورة رسميًا فلا أستطيع تأكيد وجودها؛ اسأل الإدارة.",
    en: "You can apply to provider opportunities through the relevant professional pages. I cannot confirm vacancies that have not been officially published; please ask the administration.",
    fr: "Vous pouvez postuler aux opportunités de prestataires via les pages professionnelles concernées. Je ne peux pas confirmer les postes qui n’ont pas été publiés officiellement ; contactez l’administration."
  },
  soon: {
    ar: "هذه الخدمة قيد الإضافة إلى المنصة؛ انتظرونا قريبًا. لا أستطيع تأكيد موعد إطلاقها.",
    en: "This service is being added to the platform. Coming soon; I cannot confirm a launch date.",
    fr: "Ce service est en cours d’ajout à la plateforme. Bientôt disponible ; je ne peux pas confirmer de date de lancement."
  },
  booking: {
    ar: "إرسال الطلب لا يعني تأكيد حجز أو توفر الخدمة. تراجع الإدارة التفاصيل وتتواصل معك لتأكيد ما يمكن تقديمه.",
    en: "Submitting a request does not confirm a booking or service availability. The administration reviews the details and contacts you to confirm what can be provided.",
    fr: "L’envoi d’une demande ne confirme ni réservation ni disponibilité. L’administration examine les détails et vous contacte pour confirmer ce qui peut être proposé."
  },
  unknown: {
    ar: "لا أعرف الإجابة المؤكدة عن هذا السؤال، ولا أريد تخمينها. سأحيل الاستفسار إلى إدارة رفيق لمراجعته. يمكنك استخدام صفحة التواصل.",
    en: "I do not know the confirmed answer, and I do not want to guess. Please refer this question to the RAFIQ administration through the contact page.",
    fr: "Je ne connais pas la réponse confirmée et je préfère ne pas deviner. Veuillez transmettre cette question à l’administration de RAFIQ via la page de contact."
  }
};

const rules: Array<{ intent: string; re: RegExp }> = [
  { intent: "emergency", re: /(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|جلطة|تشنج|سكتة|emergency|can't breathe|chest pain|heavy bleeding|unconscious|urgence|ne respire|douleur thoracique|hémorragie)/i },
  { intent: "medical", re: /(تشخيص|دواء|جرعة|علاج طبي|اعطني دواء|diagnos|medication|dosage|prescribe|médicament|diagnostic|posologie|traitement)/i },
  { intent: "free_join", re: /(مجاني|مجانا|رسوم|تكلفة الانضمام|رسوم التقديم|free to apply|application fee|membership fee|gratuit|frais d'inscription|frais de candidature)/i },
  { intent: "whatsapp_policy", re: /(هل.*واتساب.*(يرد|تلقائي)|رد.*واتساب|وكيل.*واتساب|whatsapp.*(bot|automated|automatic reply)|agent.*whatsapp|réponse automatique.*whatsapp|bot.*whatsapp)/i },
  { intent: "privacy", re: /(خصوصية|سرية|بياناتي|معلوماتي|privacy|confidential|confidentialité|mes données)/i },
  { intent: "sharing", re: /(هل.*(تظهر|تنشر|تشارك).*بيانات|public.*data|share.*data|données.*publiques|partager.*données)/i },
  { intent: "provider_eligibility", re: /(من.*(يمكن|يستطيع).*(التقديم|ينضم)|مين.*يقدم|who can apply|who may join|qui peut postuler|qui peut rejoindre)/i },
  { intent: "caregiver_apply", re: /(مقدم.*رعاية.*(يقدم|التقديم)|كيف.*(أقدم|اتقدم).*رعاية|caregiver.*apply|apply.*caregiver|aidant.*postuler)/i },
  { intent: "nurse_apply", re: /(ممرض.*(يقدم|التقديم)|كيف.*(أقدم|اتقدم).*تمريض|nurse.*apply|apply.*nurse|infirmier.*postuler)/i },
  { intent: "physio_apply", re: /(معالج.*فيزيائي.*(يقدم|التقديم)|كيف.*(أقدم|اتقدم).*فيزيائي|physiotherapist.*apply|kinésithérapeute.*postuler)/i },
  { intent: "doctor_apply", re: /(طبيب.*(يقدم|التقديم)|كيف.*(أقدم|اتقدم).*طبيب|doctor.*apply|médecin.*postuler)/i },
  { intent: "family_request", re: /(طلب.*رعاية.*(اهلي|أهلي|عائلتي)|رعاية.*(والدي|والدتي|أمي|ابي)|care for my family|care for my parent|soins pour ma famille|soins pour mon parent)/i },
  { intent: "apply", re: /(كيف.*(أقدم|اتقدم|التسجيل)|طريقة.*التقديم|how.*apply|how.*register|comment.*postuler|comment.*inscrire)/i },
  { intent: "followup", re: /(متى.*(ترد|الرد)|مدة.*(الرد|المراجعة)|when.*(reply|hear back)|response time|délai.*réponse|quand.*répond)/i },
  { intent: "price", re: /(سعر|تكلفة|كم.*(يكلف|السعر)|price|cost|how much|prix|combien)/i },
  { intent: "regions", re: /(مناطق|منطقة|طرابلس|الضنية|زغرتا|الكورة|البترون|بيروت|تغطية|where.*(serve|area)|regions|régions|où.*(service|intervenez))/i },
  { intent: "schedule", re: /(نهاري|ليلي|إقامة|24 ساعة|دوام|daytime|overnight|live.in|schedule|journée|nuit|présence continue)/i },
  { intent: "approval", re: /(متى.*(يقبل|قبول)|هل.*(تم قبولي|انقبلت)|approval|accepted|acceptation|ma candidature)/i },
  { intent: "sharing", re: /(هل.*(تظهر|تنشر|تشارك).*بيانات|public.*data|share.*data|données.*publiques)/i },
  { intent: "contact", re: /(تواصل|اتصل|رقم.*الإدارة|whatsapp.*number|contact.*admin|contacter.*administration)/i },
  { intent: "telegram", re: /(رابط.*تلغرام|بوت.*تلغرام|قناة.*تلغرام|telegram.*(bot|channel|link)|lien.*telegram|chaîne.*telegram)/i },
  { intent: "complaint", re: /(شكوى|اشتك|complaint|réclamation|plainte)/i },
  { intent: "jobs", re: /(وظيفة|وظائف|شاغر|توظيف|job|vacancy|emploi|poste vacant)/i },
  { intent: "soon", re: /(مختبر|تحاليل|أشعة|تصوير طبي|معدات طبية|أسنان|تغذية|نطق|laboratory|lab test|radiology|medical equipment|dentist|nutrition|speech therapy|laboratoire|radiologie|matériel médical|dentiste|nutrition|orthophonie)/i },
  { intent: "booking", re: /(حجز|تأكيد.*(طلب|موعد)|هل.*(تأكد|متوفر)|booking|reservation|confirmed|disponible|réservation|confirmation)/i },
  { intent: "elderly", re: /(رعاية.*(مسن|كبير السن)|كبار السن|elderly care|senior care|personne âgée|personnes âgées)/i },
  { intent: "patient", re: /(رعاية.*مريض|رعاية المرضى|مريض.*المنزل|patient care|home care.*patient|soins.*patient)/i },
  { intent: "nursing", re: /(تمريض|ممرض|ممرضة|حقن|ضماد|home nursing|nurse service|soins infirmiers)/i },
  { intent: "physio", re: /(علاج فيزيائي|علاج طبيعي|فيزيو|physio|physiotherapy|kinésithérapie)/i },
  { intent: "services", re: /(خدمات|ماذا تقدم|شو بتقدم|what services|services.*offer|quels services|services proposez)/i },
  { intent: "greeting", re: /^(مرحبا|مرحباً|اهلا|أهلا|السلام عليكم|hello|hi|hey|bonjour|salut|bonsoir)[!.؟ ]*$/i }
];

export function answerFromKnowledge(text: string, preferredLanguage?: string | null): KnowledgeResult {
  const language = (["ar", "en", "fr"].includes((preferredLanguage || "").slice(0, 2).toLowerCase())
    ? (preferredLanguage || "ar").slice(0, 2).toLowerCase()
    : detectLanguage(text)) as AgentLanguage;
  const normalized = normalize(text);
  for (const rule of rules) {
    if (rule.re.test(text) || rule.re.test(normalized)) {
      return { reply: replies[rule.intent][language], language, intent: rule.intent, matched: true };
    }
  }
  return { reply: replies.unknown[language], language, intent: "unknown", matched: false };
}
