export type RafiqLanguage = "ar" | "en";

const normalize = (value: string) => value.normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
  .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/\s+/g, " ").trim().toLowerCase();

export function detectRafiqLanguage(message: string): RafiqLanguage {
  return /[\u0600-\u06FF]/.test(message) ? "ar" : "en";
}

const AR = {
  emergency: "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.",
  services: "خدمات RAFIQ | رفيق المتاحة على المنصة: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، العلاج الفيزيائي المنزلي، وتسجيل المختبرات الطبية ومراكز الأشعة والتصوير وجهات المعدات الطبية. راجع التفاصيل عبر صفحة الخدمات أو نموذج تقديم الطلب على موقع RAFIQ.",
  elderly: "تنظم RAFIQ طلبات رعاية كبار السن داخل المنزل، بما فيها الرعاية النهارية أو الليلية أو الإقامة بحسب احتياج الأسرة وتوفر مقدم الخدمة. لا يُؤكد التوفر إلا بعد مراجعة الإدارة. ابدأ الطلب من نموذج التقديم على موقع RAFIQ.",
  patient: "تنظم RAFIQ طلبات الرعاية المنزلية للمرضى وفق تعليمات الطبيب واحتياجات الأسرة، مع مراجعة الحاجة إلى مقدم رعاية أو تمريض أو علاج فيزيائي. لا نقدم تشخيصًا أو علاجًا طبيًا. ابدأ الطلب من نموذج التقديم على موقع RAFIQ.",
  nursing: "تستقبل RAFIQ طلبات التمريض المنزلي وتراجع الاختصاص والخبرة ومتطلبات الحالة والمنطقة. لا تُنفذ الإجراءات الطبية إلا بواسطة مختص مؤهل وضمن تعليمات الطبيب. ابدأ الطلب من نموذج التقديم على موقع RAFIQ.",
  physio: "تستقبل RAFIQ طلبات العلاج الفيزيائي المنزلي وتراجعها لربطها بمعالجين ضمن الشبكة بحسب المنطقة والتوفر. لا نقدم تشخيصًا أو خطة علاج عبر المحادثة. ابدأ الطلب من نموذج التقديم على موقع RAFIQ.",
  labs: "تتيح المنصة تسجيل المختبرات الطبية وخدمات الفحوصات للمراجعة الإدارية. لا تؤكد RAFIQ حاليًا مواعيد فحوصات أو أسعارًا أو توفرًا قبل مراجعة الجهة. صفحة الخدمات: صفحة الخدمات على موقع RAFIQ .",
  imaging: "تتيح المنصة تسجيل مراكز الأشعة والتصوير والخدمات المتاحة للمراجعة الإدارية. الأسعار والمواعيد والتوفر غير مؤكدة عبر البوت؛ تواصل مع الإدارة للمراجعة.",
  equipment: "تتيح المنصة تسجيل مراكز وشركات المعدات الطبية للبيع أو التأجير أو الدعم الفني. لا تتوفر قائمة منتجات أو أسعار مؤكدة في البوت حاليًا؛ تواصل مع الإدارة.",
  provider: "يمكن لمقدمي الرعاية والممرضين والمعالجين الفيزيائيين التسجيل وإرسال الخبرة والاختصاص والخدمات ومناطق العمل والوثائق للمراجعة. التسجيل لا يعني القبول أو التوظيف أو ضمان الطلبات. ابدأ من نموذج التقديم على موقع RAFIQ.",
  institution: "يمكن للمختبرات ومراكز الأشعة وجهات المعدات الطبية إرسال طلب تسجيل مستقل من صفحة الخدمات. يخضع الطلب والوثائق للمراجعة الإدارية، ولا يعني التسجيل اعتمادًا نهائيًا.",
  cv: "خدمة السيرة الذاتية متاحة وفق الأسعار المعتمدة: CV ‏$25 عرضًا / $35 عاديًا؛ رسالة التقديم ‏$10 / $16؛ الباقة ‏$35 / $51؛ واللغة الإضافية ‏$20 / $28. لا نضيف خبرات أو مؤهلات غير مقدمة من صاحب الطلب. اكتب CV للمتابعة.",
  price: "لا يوجد سعر موحد منشور لخدمات الرعاية أو التمريض أو العلاج الفيزيائي أو خدمات المؤسسات. السعر والتوفر يُؤكدان بعد مراجعة تفاصيل الطلب والجهة. أسعار خدمة CV فقط: السيرة $25/$35، رسالة التقديم $10/$16، الباقة $35/$51، واللغة الإضافية $20/$28.",
  areas: "تستقبل RAFIQ طلبات من مناطق لبنان، لكن قبول كل طلب وتوفر الخدمة يعتمدان على المنطقة والاختصاص. اختر المحافظة والقضاء والمنطقة في نموذج الطلب: نموذج التقديم على موقع RAFIQ .",
  hours: "لا تنشر المنصة ساعات عمل موحدة مؤكدة للإدارة. أرسل استفسارك عبر WhatsApp على +961 81 506 299 ليُراجع الفريق الطلب.",
  privacy: "تُستخدم المعلومات والوثائق المرسلة بالقدر اللازم لمراجعة الطلب وإدارة المنصة. أرسل البيانات الضرورية فقط، ولا ترسل كلمات مرور أو رموز تحقق. راجع صفحة الخصوصية على موقع RAFIQ.",
  contact: "للتواصل مع إدارة RAFIQ: WhatsApp ‏+961 81 506 299. رسائل WhatsApp يراجعها المالك ويرد عليها يدويًا؛ الوكيل الآلي يعمل على Telegram فقط. بوت Telegram: https://t.me/RAFIQ_Care_Bot .",
  jobs: "لا توجد قائمة وظائف شاغرة مؤكدة منشورة حاليًا. يمكن لمقدمي الرعاية إرسال ملف الخبرة والاختصاص ومناطق العمل عبر نموذج التسجيل لمراجعته. التسجيل لا يضمن التوظيف أو وجود شاغر.",
  registration: "لا تحتاج إلى إنشاء حساب مسبقًا لتقديم طلب عبر نموذج RAFIQ. اختر فئة الطلب وأرسل البيانات الضرورية وموافقة الخصوصية. إرسال الطلب لا يعني القبول أو التوظيف أو تأكيد حجز.",
  availability: "يمكنك طلب رعاية نهارية أو ليلية أو إقامة، بما فيها نظام 24 ساعة عند الحاجة، لكن التوفر الفعلي يُراجع حسب الحالة والمنطقة ومقدمي الخدمة ولا يُؤكد قبل مراجعة الإدارة.",
  household: "تتضمن الرعاية الشخصية المساعدة في النظافة واللباس والطعام والحركة والروتين اليومي. الطبخ والتنظيف والقيادة والمرافقة خارج المنزل مهام إضافية تُحدد مسبقًا عند الاتفاق.",
  noSubscription: "لا تفرض RAFIQ اشتراكًا شهريًا أو سنويًا على مقدمي الرعاية في نموذجها الأولي. قد تخضع خدمات أخرى لشروط منفصلة يوضحها الفريق قبل الاتفاق.",
  unknown: "هذه المعلومة غير متوفرة حاليًا في المعلومات المعتمدة لمنصة RAFIQ. لا أريد تخمينها أو إعطاء وعد غير مؤكد. يرجى التواصل مع الإدارة عبر WhatsApp ‏+961 81 506 299 للمراجعة.",
};

const EN = {
  emergency: "If this is an emergency or there is immediate danger, contact local emergency services or the treating medical team now. Do not delay urgent care while waiting for RAFIQ.",
  services: "RAFIQ currently lists elderly care, patient home care, home nursing, home physiotherapy, and registration for medical laboratories, imaging centres, and medical-equipment providers. See صفحة الخدمات على موقع RAFIQ or submit a request at نموذج التقديم على موقع RAFIQ.",
  elderly: "RAFIQ accepts requests for in-home elderly care, including daytime, overnight, or live-in arrangements, subject to review and provider availability. Availability is not confirmed until the team reviews the request. Start at نموذج التقديم على موقع RAFIQ.",
  patient: "RAFIQ organizes home-care requests for patients in line with the treating physician's instructions and the family's needs. We do not diagnose or provide medical treatment. Submit a request using the RAFIQ website's request form.",
  nursing: "RAFIQ accepts home-nursing requests and reviews the required specialty, experience, care needs, and location. Clinical procedures must be handled by qualified professionals under medical instructions. Submit a request using the RAFIQ website's request form.",
  physio: "RAFIQ accepts home-physiotherapy requests and reviews them for matching with network therapists based on location and availability. This chat does not provide diagnosis or treatment plans. Submit a request using the RAFIQ website's request form.",
  labs: "The platform allows medical laboratories to register their testing services for administrative review. Appointments, prices, and availability are not confirmed by this bot.",
  imaging: "Imaging centres can register their services for administrative review. Prices, appointments, and availability are not confirmed through this bot; contact the team for review.",
  equipment: "Medical-equipment providers can register for sales, rental, or technical-support listings. A verified product catalogue and prices are not currently available through this bot; contact the team.",
  provider: "Caregivers, nurses, and physiotherapists can submit their experience, specialty, services, work areas, and documents for review. Registration does not guarantee approval, employment, or service requests. Start at نموذج التقديم على موقع RAFIQ.",
  institution: "Medical laboratories, imaging centres, and medical-equipment providers can submit a registration request from the Services page. Submissions are reviewed; registration is not final approval.",
  cv: "CV service prices: CV $25 promotional / $35 regular; cover letter $10 / $16; bundle $35 / $51; extra language $20 / $28. We do not invent experience or qualifications. Type CV to continue.",
  price: "There is no published standard price for care, nursing, physiotherapy, or institutional services. The team confirms price and availability after reviewing the request. CV prices only: CV $25/$35, cover letter $10/$16, bundle $35/$51, extra language $20/$28.",
  areas: "RAFIQ accepts requests from across Lebanon, but each service is subject to location and provider availability. Select your area in the request form: نموذج التقديم على موقع RAFIQ.",
  hours: "The platform does not publish confirmed general office hours. Contact the team on WhatsApp at +961 81 506 299 for review.",
  privacy: "Submitted information and documents are used as needed to review requests and operate the platform. Share only necessary information; never send passwords or verification codes. See the Privacy page on the RAFIQ website.",
  contact: "Contact RAFIQ administration on WhatsApp: +961 81 506 299. WhatsApp messages are reviewed and answered manually by the owner; the automated agent runs on Telegram only. Telegram bot: https://t.me/RAFIQ_Care_Bot.",
  jobs: "There is no verified public list of current vacancies. Care providers may submit their experience, specialty and work areas through the registration form for review. Registration does not guarantee employment or an open position.",
  registration: "You do not need to create an account before submitting a RAFIQ request. Choose the request category, provide the necessary details and consent to privacy processing. Submission does not mean approval, employment or a confirmed booking.",
  availability: "You may request daytime, overnight or live-in care, including a 24-hour arrangement where needed. Actual availability depends on the case, location and providers and is not confirmed before administrative review.",
  household: "Personal care may include help with hygiene, dressing, meals, mobility and daily routines. Cooking, cleaning, driving and outings are additional tasks that must be agreed in advance.",
  noSubscription: "RAFIQ's initial caregiver model does not charge caregivers a monthly or annual subscription. Other services may have separate terms that the team explains before agreement.",
  unknown: "This information is not currently available in RAFIQ's approved information. I will not guess or make an unconfirmed promise. Please contact the team on WhatsApp at +961 81 506 299.",
};

export function getRafiqKnowledgeReply(message: string, language: RafiqLanguage = detectRafiqLanguage(message)): string | null {
  const t = normalize(message);
  const a = language === "ar" ? AR : EN;
  if (/(طوارئ|طواري|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة|emergency|chest pain|unconscious|severe bleeding|shortness of breath)/.test(t)) return a.emergency;
  if (/(cv|cover letter|السيرة الذاتية|سيرة.*ذاتية|سيره.*ذاتيه|رساله تقديم|رسالة تقديم)/.test(t)) return a.cv;
  if (/(مختبر|تحاليل|فحوصات|laborator|lab test)/.test(t)) return a.labs;
  if (/(اشع|تصوير|radiolog|imaging|x.?ray)/.test(t)) return a.imaging;
  if (/(معدات طبيه|معدات طبية|medical equipment|wheelchair|oxygen concentrator)/.test(t)) return a.equipment;
  if (/(ممرض|ممرضه|ممرضة|تمريض|nurs|injection|dressing)/.test(t)) return a.nursing;
  if (/(فيزيا|فيزيو|علاج طبيعي|علاج فيزيائي|physio|physical therap)/.test(t)) return a.physio;
  if (/(مسن|كبار السن|كبير السن|والدي|والدتي|جدتي|جدي|elderly|senior care|old age)/.test(t)) return a.elderly;
  if (/(مريض|مريضه|مريضة|بعد المستشفى|بعد عمليه|بعد عملية|patient|after hospital)/.test(t)) return a.patient;
  if (/(اشتراك|subscription|monthly fee|annual fee)/.test(t)) return a.noSubscription;
  if (/(وظيف|توظيف|شاغر|vacanc|job opening|employment)/.test(t)) return a.jobs;
  if (/(مقدم رعايه|مقدم رعاية|مقدمي الرعايه|caregiver|job application|provider registration)/.test(t)) return a.provider;
  if (/(موسس|الموسس|شركه|شركة|تسجيل مختبر|تسجيل مركز|institution|register a lab|register centre)/.test(t)) return a.institution;
  if (/(24 ساع|اربعه وعشرين|أربعة وعشرين|ليل|نهار|اقامه|إقامة|24.hour|overnight|live.in)/.test(t)) return a.availability;
  if (/(طبخ|تنظيف|قياده|قيادة|اعمال منزليه|أعمال منزلية|cooking|cleaning|driving|household tasks)/.test(t)) return a.household;
  if (/(تسجيل|انشاء حساب|إنشاء حساب|حساب مسبق|register|registration|sign up|create an account)/.test(t)) return a.registration;
  if (/(سعر|تكلف|اسعار|الاسعار|price|cost|how much|(?:^|\\s)كم(?:\\s|$))/.test(t)) return a.price;
  if (/(منطقه|منطقة|وين|اين|تغطيه|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت|tripoli|where.*area|service area|location)/.test(t)) return a.areas;
  if (/(خصوصيه|خصوصية|بيانات|privacy|personal data)/.test(t)) return a.privacy;
  if (/(ساعات|دوام|متى تفتح|working hours|opening hours|business hours)/.test(t)) return a.hours;
  if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام|contact|phone number)/.test(t)) return a.contact;
  if (/(خدمات|ماذا تقدم|شو بتقدم|services|what do you offer)/.test(t)) return a.services;
  if (/(سلام|مرحبا|مرحباً|اهلا|أهلا|hello|hi|good morning|good evening)/.test(t)) {
    return language === "ar"
      ? "أهلًا بك في RAFIQ | رفيق 🇱🇧 — نصل بالحب والأمان لرعاية العائلة. أستطيع إرشادك إلى رعاية كبار السن والمرضى والتمريض المنزلي والعلاج الفيزيائي وتسجيل الجهات. اكتب «الخدمات» أو «طلب رعاية» أو «تواصل»."
      : "Welcome to RAFIQ | رفيق 🇱🇧 — Connecting families with care, safety and compassion. I can guide you through elderly care, patient care, home nursing, physiotherapy and provider registration. Ask about services, submit a request, or contact the team.";
  }
  return null;
}

export function rafiqUnknownReply(language: RafiqLanguage = "ar"): string {
  return language === "ar" ? AR.unknown : EN.unknown;
}
