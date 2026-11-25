/* ==========================================================
   RAFIQ | رفيق — language engine
   ------------------------------------------------------------
   One button at the top-left of every page, five languages.

   Design rules, in order of importance:
     1. Never show a blank string. Anything with no translation
        falls back to the Arabic text already in the page.
     2. Never break the layout. Long Latin words wrap instead of
        overflowing, and the page stays readable at 320px.
     3. Remember the choice, and set <html lang> and <html dir>
        so screen readers and the browser agree with what is shown.

   Translations live in js/locales/<lang>.js and are keyed. A page
   marks its text with data-i18n="key"; the engine fills it in.
   ========================================================== */

/* Cache-buster. install-app.js defines RAFIQ_VERSION, but the language
   engine must work on pages that never load it, so we fall back. */
if (typeof globalThis.RAFIQ_VERSION === 'undefined') globalThis.RAFIQ_VERSION = '72';

const RAFIQ_I18N = (function () {
  'use strict';

  var LANGS = [
    { code: 'ar', label: 'العربية',  flag: '🇱🇧', dir: 'rtl' },
    { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' },
    { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹', dir: 'ltr' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' }
  ];

  var DEFAULT = 'ar';
  var KEY = 'rafiq.lang';
  var bundles = {};      // code -> { key: text }
  var current = DEFAULT;
  // Keep immutable source text/attributes so every language switch starts
  // from the original Arabic DOM, never from a previously translated value.
  var originalText = new WeakMap();
  var originalAttributes = new WeakMap();
  var originalMarkedText = new WeakMap();
  var originalTitle = document.title;

  function langMeta(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  function isKnown(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return true;
    return false;
  }

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(code) {
    try { localStorage.setItem(KEY, code); } catch (e) { /* private mode */ }
  }

  /* ---------- which language does this visitor actually read? ----------

     A member who opens the site on a phone set to French should not
     have to hunt for the button. On the very first visit the browser's
     own language list decides, and the answer is remembered from then
     on so the site never flip-flops between visits.

     The whole list is walked, not just the first entry. A phone set to
     Spanish with English listed second gets English, which is a
     language that person actually reads; dropping them into Arabic
     instead would be worse. Only when nothing in the list is
     supported does it fall back to Arabic, the source language. */
  var detected = null;

  function detect() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        list = Array.prototype.slice.call(navigator.languages);
      }
    } catch (e) { /* older browser */ }
    try { if (navigator.language) list.push(navigator.language); } catch (e) {}

    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] || '').toLowerCase().replace(/_/g, '-');
      if (!raw) continue;
      // "fr-CA" -> "fr"; an exact match on the full tag wins first
      if (isKnown(raw)) { detected = raw; return raw; }
      var base = raw.split('-')[0];
      if (isKnown(base)) { detected = base; return base; }
    }
    return DEFAULT;
  }

  function loadScript(code) {
    if (bundles[code]) return Promise.resolve(bundles[code]);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = '/js/locales/' + code + '.js?v=' + RAFIQ_VERSION;
      s.async = true;
      s.onload = function () {
        resolve(bundles[code] || null);
      };
      s.onerror = function () {
        resolve(null);          // a missing translation is not a crash
      };
      document.head.appendChild(s);
    });
  }

  /* Register a bundle: called by every js/locales/<lang>.js file */
  function register(code, dict) {
    bundles[code] = dict || {};
  }

  function translate(key, lang) {
    var d = bundles[lang || current];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return null;
  }

  /* Some older public pages were written before data-i18n markers were
     added. Their Arabic copy is still valid source copy, so translate it
     by looking it up in the Arabic source bundle. This keeps old pages
     compatible without rewriting their SEO/content structure. */
  var sourceToKey = Object.create(null);
  var legacyKeys = {
    'RAFIQ | رفيق': 'home.h1',
    'نصل بالحب والأمان لرعاية العائلة': 'home.tagline',
    'منصة رعاية منزلية وخدمات صحية في لبنان': 'home.who',
    'طلب رعاية أو انتساب': 'nav.form',
    'الرئيسية': 'nav.home',
    'الخدمات': 'nav.services',
    'المناطق': 'nav.regions',
    'كل المناطق': 'nav.allRegions',
    'دليل الرعاية': 'nav.guideAlt',
    'الأسئلة الشائعة': 'nav.faq',
    'لمقدمي الرعاية': 'nav.caregivers',
    'مقدمو الرعاية': 'nav.caregivers',
    'اسأل الوكيل': 'nav.agent',
    'مساعد رفيق': 'nav.agent',
    'واتساب RAFIQ': 'cta.wa',
    'واتساب': 'cta.waShort',
    'تقديم طلب': 'cta.request',
    'ابدأ التسجيل': 'services.join.cta',
    'خدمات RAFIQ': 'services.h1',
    'الرعاية المنزلية': 'services.home.h',
    'التمريض المنزلي': 'home.pick.3.t',
    'العلاج الفيزيائي': 'home.pick.4.t',
    'رعاية كبار السن': 'home.pick.1.t',
    'رعاية المرضى': 'home.pick.2.t',
    'دليل الرعاية المنزلية RAFIQ': 'guide.h1',
    'الأسئلة الشائعة حول الرعاية المنزلية': 'faq.h1',
    'إرسال طلب الانتساب مجانًا': 'cta.request',
    'إرسال الطلب': 'cta.request',
    'انتظرونا قريبًا': 'services.soon.badge',
    'خدمات قادمة': 'services.soon.h',
    'التسجيل': 'care.i1.h',
    'وظائف الرعاية': 'care.i2.h',
    'CV احترافي ATS': 'care.i3.h',
    'بدون اشتراك': 'care.i4.h'
  };

  function normalizeSource(s) {
    return String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  }

  function rebuildSourceIndex() {
    sourceToKey = Object.create(null);
    var ar = bundles[DEFAULT] || {};
    Object.keys(ar).forEach(function (key) {
      var value = normalizeSource(ar[key]);
      if (value) sourceToKey[value] = key;
    });
    Object.keys(legacyKeys).forEach(function (value) {
      sourceToKey[normalizeSource(value)] = legacyKeys[value];
    });
  }

  // Copy for the seven public intake/partner pages added after the original
  // locale bundles. Exact-source matching keeps this additive and safe.
  var PAGE_COPY = {
    "الممرضون والممرضات": ["Nurses", "Infirmiers et infirmières", "Infermieri e infermiere", "Pflegekräfte"],
    "مقدمو الرعاية": ["Caregivers", "Aidants", "Assistenti alla cura", "Betreuungskräfte"],
    "المعالجون الفيزيائيون": ["Physiotherapists", "Kinésithérapeutes", "Fisioterapisti", "Physiotherapeuten"],
    "الإعلانات والشراكات": ["Advertising and partnerships", "Publicité et partenariats", "Pubblicità e partnership", "Werbung und Partnerschaften"],
    "الأطباء والاختصاصات الطبية": ["Doctors and medical specialties", "Médecins et spécialités médicales", "Medici e specialità mediche", "Ärzte und medizinische Fachgebiete"],
    "طلب رعاية لأحد أفراد العائلة": ["Request care for a family member", "Demander des soins pour un membre de la famille", "Richiedi assistenza per un familiare", "Betreuung für ein Familienmitglied anfragen"],
    "الانتساب والاستفادة من تقديمات RAFIQ": ["Join RAFIQ and access member benefits", "Adhérer à RAFIQ et bénéficier des avantages", "Iscriviti a RAFIQ e accedi ai vantaggi", "RAFIQ beitreten und Mitgliedervorteile nutzen"],
    "العودة إلى الصفحة الأولى": ["Back to homepage", "Retour à l’accueil", "Torna alla homepage", "Zur Startseite"],
    "الخدمات": ["Services", "Services", "Servizi", "Leistungen"],
    "طلب رعاية أو انتساب": ["Care request or registration", "Demande de soins ou inscription", "Richiesta di assistenza o iscrizione", "Betreuungsanfrage oder Registrierung"],
    "التقديم والانتساب": ["Applications and registration", "Candidatures et adhésion", "Candidature e iscrizione", "Bewerbungen und Mitgliedschaft"],
    "الإعلانات والمنشآت الصحية": ["Ads and healthcare facilities", "Publicités et établissements de santé", "Annunci e strutture sanitarie", "Anzeigen und Gesundheitseinrichtungen"],
    "الأطباء": ["Doctors", "Médecins", "Medici", "Ärzte"],
    "طلب رعاية للأهل": ["Request care for family", "Demander des soins pour la famille", "Richiedi assistenza per la famiglia", "Betreuung für Angehörige anfragen"],
    "المنتسبون والتقديمات": ["Members and benefits", "Membres et avantages", "Iscritti e vantaggi", "Mitglieder und Vorteile"],
    "دليل الرعاية": ["Care guide", "Guide des soins", "Guida all’assistenza", "Pflegeleitfaden"],
    "الأسئلة الشائعة": ["Frequently asked questions", "Questions fréquentes", "Domande frequenti", "Häufige Fragen"],
    "المناطق": ["Areas", "Zones", "Zone", "Einsatzgebiete"],
    "مساعد رفيق": ["RAFIQ assistant", "Assistant RAFIQ", "Assistente RAFIQ", "RAFIQ-Assistent"],
    "قدّم ملفك المهني للانضمام إلى شبكة التمريض والرعاية المنزلية في لبنان.": ["Submit your professional profile to join RAFIQ’s nursing and home-care network in Lebanon.", "Soumettez votre profil professionnel pour rejoindre le réseau de soins infirmiers et à domicile de RAFIQ au Liban.", "Invia il tuo profilo professionale per entrare nella rete RAFIQ di assistenza infermieristica e domiciliare in Libano.", "Reichen Sie Ihr Berufsprofil ein, um dem RAFIQ-Netzwerk für Pflege und häusliche Betreuung im Libanon beizutreten."],
    "مقدمو ومقدمات الرعاية": ["Caregivers", "Auxiliaires de vie", "Assistenti alla cura", "Betreuungskräfte"],
    "سجّل خبرتك ورغبتك في تقديم الرعاية المنزلية للعائلات في لبنان.": ["Register your experience and interest in providing home care to families in Lebanon.", "Indiquez votre expérience et votre souhait de fournir des soins à domicile aux familles au Liban.", "Registra la tua esperienza e la disponibilità a fornire assistenza domiciliare alle famiglie in Libano.", "Geben Sie Ihre Erfahrung und Ihr Interesse an häuslicher Betreuung für Familien im Libanon an."],
    "المعالجون والمعالجات الفيزيائيون": ["Physiotherapists", "Kinésithérapeutes", "Fisioterapisti", "Physiotherapeuten"],
    "قدّم ملفك المهني لتقديم خدمات العلاج الفيزيائي المنزلي أو في العيادة ضمن شبكة RAFIQ.": ["Submit your professional profile to provide home or clinic-based physiotherapy through the RAFIQ network.", "Soumettez votre profil professionnel pour proposer des services de kinésithérapie à domicile ou en cabinet au sein du réseau RAFIQ.", "Invia il tuo profilo professionale per offrire fisioterapia a domicilio o in clinica nella rete RAFIQ.", "Reichen Sie Ihr Berufsprofil ein, um Physiotherapie zu Hause oder in einer Praxis über das RAFIQ-Netzwerk anzubieten."],
    "أعلن معنا في RAFIQ": ["Advertise with RAFIQ", "Faites de la publicité avec RAFIQ", "Fai pubblicità con RAFIQ", "Werben Sie mit RAFIQ"],
    "مساحة تعريفية للمختبرات ومراكز الأشعة ومراكز بيع وتأجير المعدات الطبية في لبنان.": ["A listing space for laboratories, imaging centers, and medical equipment sales and rental centers in Lebanon.", "Un espace de présentation pour les laboratoires, centres d’imagerie et centres de vente et de location de matériel médical au Liban.", "Uno spazio informativo per laboratori, centri di diagnostica per immagini e centri di vendita e noleggio di dispositivi medici in Libano.", "Eine Präsentationsfläche für Labore, Bildgebungszentren sowie Anbieter für Verkauf und Vermietung medizinischer Geräte im Libanon."],
    "الأطباء من جميع الاختصاصات": ["Doctors across all specialties", "Médecins de toutes spécialités", "Medici di tutte le specialità", "Ärzte aller Fachrichtungen"],
    "انضم إلى شبكة RAFIQ لتسهيل وصول العائلات إلى الأطباء والخدمات الصحية بعد مراجعة الملف واعتماده.": ["Join the RAFIQ network to help families access doctors and health services after profile review and approval.", "Rejoignez le réseau RAFIQ pour faciliter l’accès des familles aux médecins et aux services de santé après examen et validation du dossier.", "Unisciti alla rete RAFIQ per facilitare l’accesso delle famiglie a medici e servizi sanitari dopo la revisione e l’approvazione del profilo.", "Treten Sie dem RAFIQ-Netzwerk bei, damit Familien nach Prüfung und Freigabe des Profils leichter Ärzte und Gesundheitsdienste erreichen."],
    "اطلب الرعاية لأهلك": ["Request care for your family", "Demandez des soins pour vos proches", "Richiedi assistenza per la tua famiglia", "Betreuung für Ihre Angehörigen anfragen"],
    "أرسل معلومات أولية مختصرة وسيراجع فريق RAFIQ الطلب للتواصل معك.": ["Send brief initial information. The RAFIQ team will review your request and contact you.", "Envoyez quelques informations initiales. L’équipe RAFIQ examinera votre demande et vous contactera.", "Invia alcune informazioni iniziali. Il team RAFIQ esaminerà la richiesta e ti contatterà.", "Senden Sie kurze erste Angaben. Das RAFIQ-Team prüft Ihre Anfrage und meldet sich bei Ihnen."],
    "المنتسبون إلى RAFIQ": ["RAFIQ members", "Membres de RAFIQ", "Membri RAFIQ", "RAFIQ-Mitglieder"],
    "سجّل بياناتك للاستفادة من التقديمات والخدمات والخصومات التي تتوفر ضمن شبكة RAFIQ.": ["Register your details to access offers, services, and discounts available through the RAFIQ network.", "Enregistrez vos coordonnées pour accéder aux offres, services et réductions disponibles dans le réseau RAFIQ.", "Registra i tuoi dati per accedere a offerte, servizi e sconti disponibili nella rete RAFIQ.", "Registrieren Sie Ihre Angaben, um Angebote, Dienstleistungen und Rabatte im RAFIQ-Netzwerk zu nutzen."],
    "شروط التقديم": ["Application requirements", "Conditions de candidature", "Requisiti per la candidatura", "Bewerbungsvoraussetzungen"],
    "الاسم الأول": ["First name ", "Prénom ", "Nome ", "Vorname "],
    "اسم العائلة": ["Last name ", "Nom ", "Cognome ", "Nachname "],
    "رقم الهاتف": ["Phone number ", "Numéro de téléphone ", "Numero di telefono ", "Telefonnummer "],
    "المدينة / المنطقة": ["City / area ", "Ville / région ", "Città / zona ", "Stadt / Gebiet "],
    "المدينة / المناطق": ["City / areas ", "Ville / zones ", "Città / zone ", "Stadt / Gebiete "],
    "الشهادة العلمية": ["Academic qualification ", "Diplôme ", "Titolo di studio ", "Ausbildungsabschluss "],
    "رقم الترخيص": ["License number ", "Numéro de licence ", "Numero di licenza ", "Lizenznummer "],
    "رقم الترخيص المهني": ["Professional license number ", "Numéro de licence professionnelle ", "Numero di licenza professionale ", "Berufliche Zulassungsnummer "],
    "سنوات الخبرة": ["Years of experience ", "Années d’expérience ", "Anni di esperienza ", "Jahre Berufserfahrung "],
    "التخصص": ["Specialty", "Spécialité", "Specializzazione", "Fachgebiet"],
    "ساعات التوفر": ["Availability hours ", "Heures de disponibilité ", "Orari di disponibilità ", "Verfügbare Zeiten "],
    "الخبرة العملية": ["Work experience", "Expérience professionnelle", "Esperienza lavorativa", "Berufserfahrung"],
    "السيرة الذاتية CV": ["CV / résumé ", "CV ", "Curriculum vitae ", "Lebenslauf "],
    "صورة الشهادة ": ["Certificate image ", "Image du diplôme ", "Immagine del certificato ", "Nachweis des Abschlusses "],
    "صورة الترخيص ": ["License image ", "Image de la licence ", "Immagine della licenza ", "Bild der Zulassung "],
    "اللغات": ["Languages", "Langues", "Lingue", "Sprachen"],
    "نوع الرعاية": ["Care type", "Type de soins", "Tipo di assistenza", "Betreuungsart"],
    "نظام العمل": ["Work arrangement", "Organisation du travail", "Modalità di lavoro", "Arbeitsmodell"],
    "ملخص الخبرة والمهارات": ["Summary of experience and skills", "Résumé de l’expérience et des compétences", "Riepilogo di esperienza e competenze", "Zusammenfassung von Erfahrung und Fähigkeiten"],
    "شروط التقديم": ["Application requirements", "Conditions de candidature", "Requisiti per la candidatura", "Bewerbungsvoraussetzungen"],
    "نوع المنشأة": ["Facility type", "Type d’établissement", "Tipo di struttura", "Art der Einrichtung"],
    "اسم المنشأة": ["Facility name", "Nom de l’établissement", "Nome della struttura", "Name der Einrichtung"],
    "اسم المسؤول": ["Contact person", "Nom du responsable", "Nome del referente", "Name der verantwortlichen Person"],
    "البريد الإلكتروني": ["Email address", "Adresse e-mail", "Indirizzo e-mail", "E-Mail-Adresse"],
    "المحافظة": ["Governorate", "Gouvernorat", "Governatorato", "Gouvernement"],
    "القضاء": ["District", "District", "Distretto", "Bezirk"],
    "مدة الإعلان المقترحة": ["Proposed advertising duration", "Durée publicitaire proposée", "Durata pubblicitaria proposta", "Vorgeschlagene Anzeigendauer"],
    "العنوان الكامل": ["Full address", "Adresse complète", "Indirizzo completo", "Vollständige Adresse"],
    "الخدمات والأسعار": ["Services and prices", "Services et tarifs", "Servizi e prezzi", "Leistungen und Preise"],
    "ملاحظات أو تفاصيل الإعلان": ["Notes or advertisement details", "Notes ou détails de l’annonce", "Note o dettagli dell’annuncio", "Hinweise oder Anzeigendetails"],
    "شعار المنشأة (PDF أو صورة)": ["Facility logo (PDF or image)", "Logo de l’établissement (PDF ou image)", "Logo della struttura (PDF o immagine)", "Logo der Einrichtung (PDF oder Bild)"],
    "صور المنشأة والخدمات": ["Facility and service photos", "Photos de l’établissement et des services", "Foto della struttura e dei servizi", "Fotos der Einrichtung und Dienstleistungen"],
    "مستند الترخيص / التسجيل": ["License / registration document", "Document de licence / enregistrement", "Documento di licenza / registrazione", "Zulassungs- / Registrierungsdokument"],
    "نوع الرعاية المطلوبة": ["Required care type", "Type de soins requis", "Tipo di assistenza richiesta", "Benötigte Betreuungsart"],
    "عمر الشخص المحتاج للرعاية": ["Age of the person needing care", "Âge de la personne nécessitant des soins", "Età della persona che necessita assistenza", "Alter der betreuungsbedürftigen Person"],
    "المدة المطلوبة": ["Required duration", "Durée souhaitée", "Durata richiesta", "Gewünschte Dauer"],
    "الحالة باختصار": ["Brief description of the situation", "Brève description de la situation", "Breve descrizione della situazione", "Kurze Beschreibung der Situation"],
    "ملاحظات إضافية": ["Additional notes", "Remarques supplémentaires", "Note aggiuntive", "Zusätzliche Hinweise"],
    "نوع الاستفادة المطلوبة": ["Requested benefit", "Avantage souhaité", "Vantaggio richiesto", "Gewünschter Vorteil"],
    "ملاحظات (اختياري)": ["Notes (optional)", "Remarques (facultatif)", "Note (facoltative)", "Hinweise (optional)"],
    "اختر": ["Select", "Choisir", "Seleziona", "Auswählen"],
    "تمريض عام": ["General nursing", "Soins infirmiers généraux", "Infermieristica generale", "Allgemeine Pflege"],
    "تمريض منزلي": ["Home nursing", "Soins infirmiers à domicile", "Assistenza infermieristica domiciliare", "Häusliche Krankenpflege"],
    "عناية فائقة": ["Intensive care", "Soins intensifs", "Terapia intensiva", "Intensivpflege"],
    "تمريض أطفال": ["Pediatric nursing", "Soins infirmiers pédiatriques", "Infermieristica pediatrica", "Kinderkrankenpflege"],
    "رعاية كبار السن": ["Elderly care", "Soins aux personnes âgées", "Assistenza agli anziani", "Seniorenbetreuung"],
    "اختصاص آخر": ["Other specialty", "Autre spécialité", "Altra specializzazione", "Andere Fachrichtung"],
    "كبار السن": ["Older adults", "Personnes âgées", "Anziani", "Ältere Menschen"],
    "المرضى": ["Patients", "Patients", "Pazienti", "Patienten"],
    "ذوو الاحتياجات الخاصة": ["People with disabilities", "Personnes en situation de handicap", "Persone con disabilità", "Menschen mit Behinderungen"],
    "أكثر من نوع": ["More than one type", "Plusieurs types", "Più di un tipo", "Mehrere Arten"],
    "إقامة كاملة": ["Live-in", "Présence permanente", "Convivenza", "Live-in-Betreuung"],
    "بالساعة": ["Hourly", "À l’heure", "A ore", "Stundenweise"],
    "مناوبات نهارية / ليلية": ["Day / night shifts", "Équipes de jour / nuit", "Turni diurni / notturni", "Tag- / Nachtschichten"],
    "مرن حسب الاتفاق": ["Flexible by agreement", "Flexible selon accord", "Flessibile previo accordo", "Flexibel nach Vereinbarung"],
    "العظام": ["Orthopedics", "Orthopédie", "Ortopedia", "Orthopädie"],
    "الأعصاب": ["Neurology", "Neurologie", "Neurologia", "Neurologie"],
    "الأطفال": ["Pediatrics", "Pédiatrie", "Pediatria", "Pädiatrie"],
    "إصابات الرياضة": ["Sports injuries", "Blessures sportives", "Infortuni sportivi", "Sportverletzungen"],
    "إعادة التأهيل": ["Rehabilitation", "Réadaptation", "Riabilitazione", "Rehabilitation"],
    "مكان تقديم العلاج": ["Treatment location", "Lieu de traitement", "Luogo del trattamento", "Behandlungsort"],
    "علاج منزلي": ["Home treatment", "Soins à domicile", "Trattamento domiciliare", "Behandlung zu Hause"],
    "في العيادة": ["At the clinic", "En cabinet", "In clinica", "In der Praxis"],
    "كلاهما": ["Both", "Les deux", "Entrambi", "Beides"],
    "طب عام": ["General practice", "Médecine générale", "Medicina generale", "Allgemeinmedizin"],
    "طب الأسرة": ["Family medicine", "Médecine familiale", "Medicina di famiglia", "Familienmedizin"],
    "طب الأطفال": ["Pediatrics", "Pédiatrie", "Pediatria", "Pädiatrie"],
    "القلب": ["Cardiology", "Cardiologie", "Cardiologia", "Kardiologie"],
    "الجراحة": ["Surgery", "Chirurgie", "Chirurgia", "Chirurgie"],
    "النسائية والتوليد": ["Obstetrics and gynecology", "Gynécologie-obstétrique", "Ginecologia e ostetricia", "Gynäkologie und Geburtshilfe"],
    "الجلدية": ["Dermatology", "Dermatologie", "Dermatologia", "Dermatologie"],
    "العيون": ["Ophthalmology", "Ophtalmologie", "Oftalmologia", "Augenheilkunde"],
    "الأنف والأذن والحنجرة": ["ENT", "ORL", "Otorinolaringoiatria", "HNO"],
    "الطب النفسي": ["Psychiatry", "Psychiatrie", "Psichiatria", "Psychiatrie"],
    "الأورام": ["Oncology", "Oncologie", "Oncologia", "Onkologie"],
    "التخدير": ["Anesthesiology", "Anesthésiologie", "Anestesiologia", "Anästhesiologie"],
    "الأشعة": ["Radiology", "Radiologie", "Radiologia", "Radiologie"],
    "المختبر الطبي": ["Medical laboratory", "Laboratoire médical", "Laboratorio medico", "Medizinisches Labor"],
    "مركز أشعة وتصوير": ["Imaging center", "Centre d’imagerie", "Centro di diagnostica per immagini", "Bildgebungszentrum"],
    "مركز بيع أو تأجير معدات طبية": ["Medical equipment sales or rental center", "Centre de vente ou location de matériel médical", "Centro di vendita o noleggio di dispositivi medici", "Verkauf oder Vermietung medizinischer Geräte"],
    "أسبوع": ["One week", "Une semaine", "Una settimana", "Eine Woche"],
    "شهر": ["One month", "Un mois", "Un mese", "Ein Monat"],
    "3 أشهر": ["3 months", "3 mois", "3 mesi", "3 Monate"],
    "6 أشهر": ["6 months", "6 mois", "6 mesi", "6 Monate"],
    "مدة أخرى / للمناقشة": ["Other duration / to discuss", "Autre durée / à discuter", "Altra durata / da concordare", "Andere Dauer / nach Absprache"],
    "خدمات الرعاية الصحية": ["Healthcare services", "Services de santé", "Servizi sanitari", "Gesundheitsleistungen"],
    "خصومات الجهات المتعاونة": ["Partner discounts", "Réductions des partenaires", "Sconti dei partner", "Partnerrabatte"],
    "تقديمات العائلة": ["Family benefits", "Avantages familiaux", "Vantaggi per la famiglia", "Familienleistungen"],
    "متابعة أخبار المنصة": ["Platform updates", "Actualités de la plateforme", "Aggiornamenti della piattaforma", "Plattform-Neuigkeiten"],
    "نهاراً، ليلاً، مناوبات، حسب الاتفاق": ["Daytime, night, shifts, by agreement", "Jour, nuit, rotations, selon accord", "Diurno, notturno, turni, previo accordo", "Tagsüber, nachts, Schichten, nach Vereinbarung"],
    "أوافق على مراجعة بياناتي المهنية لأغراض الانتساب إلى RAFIQ.": ["I agree to the review of my professional information for RAFIQ registration.", "J’accepte l’examen de mes informations professionnelles dans le cadre de mon adhésion à RAFIQ.", "Acconsento alla verifica dei miei dati professionali ai fini dell’iscrizione a RAFIQ.", "Ich stimme der Prüfung meiner beruflichen Angaben für die Registrierung bei RAFIQ zu."],
    "أوافق على استخدام بياناتي لمراجعة طلب الانتساب والتواصل بشأن فرص مناسبة.": ["I agree to the use of my information to review my registration and contact me about suitable opportunities.", "J’accepte l’utilisation de mes informations pour examiner ma candidature et me contacter au sujet d’opportunités adaptées.", "Acconsento all’uso dei miei dati per esaminare la candidatura e contattarmi per opportunità adeguate.", "Ich stimme der Verwendung meiner Angaben zur Prüfung meiner Registrierung und zur Kontaktaufnahme bezüglich geeigneter Möglichkeiten zu."],
    "أقر بصحة بيانات المنشأة وأوافق على مراجعة الطلب من إدارة RAFIQ.": ["I confirm that the facility information is accurate and agree to review by RAFIQ management.", "Je confirme l’exactitude des informations de l’établissement et accepte l’examen par la direction de RAFIQ.", "Confermo l’esattezza dei dati della struttura e accetto la revisione da parte della direzione RAFIQ.", "Ich bestätige die Richtigkeit der Einrichtungsangaben und stimme der Prüfung durch die RAFIQ-Leitung zu."],
    "أوافق على استخدام بيانات التواصل ومعلومات الطلب لمراجعته والرد عليّ.": ["I agree to the use of my contact details and request information for review and response.", "J’accepte l’utilisation de mes coordonnées et des informations de la demande pour son examen et une réponse.", "Acconsento all’uso dei miei recapiti e delle informazioni della richiesta per la valutazione e la risposta.", "Ich stimme der Verwendung meiner Kontaktdaten und Anfrageinformationen zur Prüfung und Beantwortung zu."],
    "أوافق على استخدام بياناتي المهنية لمراجعة طلب الانضمام إلى RAFIQ.": ["I agree to the use of my professional information to review my application to join RAFIQ.", "J’accepte l’utilisation de mes informations professionnelles pour examiner ma demande d’adhésion à RAFIQ.", "Acconsento all’uso dei miei dati professionali per valutare la richiesta di adesione a RAFIQ.", "Ich stimme der Verwendung meiner beruflichen Angaben zur Prüfung meines Antrags auf Aufnahme bei RAFIQ zu."],
    "قدّم الآن": ["Submit now", "Envoyer", "Invia ora", "Jetzt einreichen"],
    "أعلن معنا": ["Advertise with us", "Annoncez avec nous", "Pubblicizza con noi", "Mit uns werben"],
    "قدّم ملفك": ["Submit your profile", "Soumettre votre profil", "Invia il tuo profilo", "Profil einreichen"],
    "إرسال طلب الرعاية": ["Send care request", "Envoyer la demande de soins", "Invia richiesta di assistenza", "Betreuungsanfrage senden"],
    "انتسب الآن": ["Join now", "Adhérer maintenant", "Iscriviti ora", "Jetzt beitreten"],
    "يخضع الملف لمراجعة الإدارة والتحقق قبل أي اعتماد أو تواصل بشأن العمل.": ["The profile is subject to management review and verification before approval or work-related contact.", "Le dossier est soumis à l’examen et à la vérification de la direction avant toute validation ou prise de contact concernant le travail.", "Il profilo è soggetto a revisione e verifica da parte della direzione prima di qualsiasi approvazione o contatto lavorativo.", "Das Profil wird vor einer Freigabe oder arbeitsbezogenen Kontaktaufnahme von der Leitung geprüft und verifiziert."],
    "الممرضون والممرضات | RAFIQ": ["Nurses | RAFIQ", "Infirmiers et infirmières | RAFIQ", "Infermieri e infermiere | RAFIQ", "Pflegekräfte | RAFIQ"],
    "مقدمو الرعاية | RAFIQ": ["Caregivers | RAFIQ", "Auxiliaires de vie | RAFIQ", "Assistenti alla cura | RAFIQ", "Betreuungskräfte | RAFIQ"],
    "المعالجون الفيزيائيون | RAFIQ": ["Physiotherapists | RAFIQ", "Kinésithérapeutes | RAFIQ", "Fisioterapisti | RAFIQ", "Physiotherapeuten | RAFIQ"],
    "الإعلانات والشراكات | RAFIQ": ["Advertising and partnerships | RAFIQ", "Publicité et partenariats | RAFIQ", "Pubblicità e partnership | RAFIQ", "Werbung und Partnerschaften | RAFIQ"],
    "الأطباء والاختصاصات الطبية | RAFIQ": ["Doctors and medical specialties | RAFIQ", "Médecins et spécialités médicales | RAFIQ", "Medici e specialità mediche | RAFIQ", "Ärzte und medizinische Fachgebiete | RAFIQ"],
    "طلب رعاية لأحد أفراد العائلة | RAFIQ": ["Request care for a family member | RAFIQ", "Demander des soins pour un membre de la famille | RAFIQ", "Richiedi assistenza per un familiare | RAFIQ", "Betreuung für ein Familienmitglied anfragen | RAFIQ"],
    "إرسال الطلب لا يعني نشر الإعلان. تُراجع إدارة RAFIQ بيانات المنشأة والمحتوى والمدة، ولا يظهر أي إعلان إلا بعد الموافقة الصريحة.": ["Submitting a request does not mean the advertisement will be published. RAFIQ management reviews the facility details, content, and duration. Ads appear only after explicit approval.", "L’envoi d’une demande ne garantit pas la publication de l’annonce. La direction de RAFIQ examine les informations de l’établissement, le contenu et la durée. Toute annonce n’est publiée qu’après approbation explicite.", "L’invio della richiesta non garantisce la pubblicazione dell’annuncio. La direzione RAFIQ verifica i dati della struttura, il contenuto e la durata. Gli annunci vengono pubblicati solo dopo approvazione esplicita.", "Das Einreichen einer Anfrage bedeutet nicht, dass die Anzeige veröffentlicht wird. Die RAFIQ-Leitung prüft die Einrichtungsdaten, den Inhalt und die Laufzeit. Anzeigen werden nur nach ausdrücklicher Genehmigung veröffentlicht."],
    "صورة الشهادة": ["Certificate image", "Image du diplôme", "Immagine del certificato", "Abschlussnachweis (Bild)"],
    "صورة الترخيص": ["License image", "Image de la licence", "Immagine della licenza", "Zulassungsnachweis (Bild)"],
    "المناطق المتاحة": ["Available areas", "Zones disponibles", "Zone disponibili", "Verfügbare Gebiete"],
    "شهادات الدورات": ["Course certificates", "Certificats de formation", "Certificati dei corsi", "Kurszertifikate"],
    "شهادات الخبرة أو المراجع": ["Experience certificates or references", "Attestations d’expérience ou références", "Certificati di esperienza o referenze", "Erfahrungsnachweise oder Referenzen"],
    "الخدمات والخبرة": ["Services and experience", "Services et expérience", "Servizi ed esperienza", "Leistungen und Erfahrung"],
    "الشهادة / إثبات الاختصاص": ["Certificate / proof of specialty", "Diplôme / preuve de spécialité", "Certificato / prova della specializzazione", "Abschluss / Fachgebietsnachweis"],
    "اختر النوع": ["Select type", "Choisir le type", "Seleziona il tipo", "Typ auswählen"],
    "مختبر طبي": ["Medical laboratory", "Laboratoire médical", "Laboratorio medico", "Medizinisches Labor"],
    "رقم الترخيص / السجل": ["License / registration number", "Numéro de licence / registre", "Numero di licenza / registro", "Lizenz- / Registernummer"],
    "المنطقة": ["Area", "Zone", "Zona", "Gebiet"],
    "الاختصاص الطبي": ["Medical specialty", "Spécialité médicale", "Specialità medica", "Medizinisches Fachgebiet"],
    "اختر الاختصاص": ["Select specialty", "Choisir une spécialité", "Seleziona la specialità", "Fachgebiet auswählen"],
    "مكان العمل": ["Work location", "Lieu de travail", "Luogo di lavoro", "Arbeitsort"],
    "المنطقة / المدينة": ["Area / city", "Zone / ville", "Zona / città", "Gebiet / Stadt"],
    "المواعيد المتاحة": ["Available appointments", "Rendez-vous disponibles", "Appuntamenti disponibili", "Verfügbare Termine"],
    "نوع تقديم الخدمة": ["Service delivery type", "Type de prestation", "Tipo di erogazione del servizio", "Art der Leistungserbringung"],
    "زيارة منزلية": ["Home visit", "Visite à domicile", "Visita domiciliare", "Hausbesuch"],
    "نبذة عن الخبرة والخدمات": ["Brief overview of experience and services", "Bref aperçu de l’expérience et des services", "Breve panoramica di esperienza e servizi", "Kurzbeschreibung von Erfahrung und Leistungen"],
    "اسم صاحب الطلب": ["Applicant name", "Nom du demandeur", "Nome del richiedente", "Name des Antragstellers"],
    "رعاية مريض": ["Patient care", "Soins aux patients", "Assistenza ai pazienti", "Patientenbetreuung"],
    "علاج فيزيائي": ["Physiotherapy", "Kinésithérapie", "Fisioterapia", "Physiotherapie"],
    "استشارة لتحديد الخدمة": ["Consultation to identify the required service", "Consultation pour déterminer le service nécessaire", "Consulenza per individuare il servizio necessario", "Beratung zur Bestimmung der benötigten Leistung"],
    "مؤقتة": ["Temporary", "Temporaire", "Temporanea", "Vorübergehend"],
    "طويلة الأمد": ["Long-term", "À long terme", "A lungo termine", "Langfristig"],
    "غير محددة بعد": ["Not yet determined", "Pas encore déterminée", "Non ancora definita", "Noch nicht festgelegt"],
    "ما الذي يقدمه الانتساب؟": ["What does membership offer?", "Quels sont les avantages de l’adhésion ?", "Cosa offre l’iscrizione?", "Was bietet die Mitgliedschaft?"],
    "التعرّف إلى الخدمات والتقديمات المتاحة عبر المنصة.": ["Discover services and benefits available through the platform.", "Découvrez les services et avantages proposés par la plateforme.", "Scopri i servizi e i vantaggi disponibili sulla piattaforma.", "Entdecken Sie die über die Plattform verfügbaren Leistungen und Vorteile."],
    "الاستفادة من الخصومات التي تعتمدها الجهات المتعاقدة عند توفرها.": ["Access discounts offered by contracted partners when available.", "Bénéficiez des réductions proposées par les partenaires contractuels lorsqu’elles sont disponibles.", "Usufruisci degli sconti offerti dai partner convenzionati, quando disponibili.", "Nutzen Sie verfügbare Rabatte unserer Vertragspartner."],
    "متابعة الإعلانات والتحديثات الرسمية.": ["Follow official announcements and updates.", "Suivez les annonces et mises à jour officielles.", "Segui gli annunci e gli aggiornamenti ufficiali.", "Verfolgen Sie offizielle Ankündigungen und Aktualisierungen."],
    "تختلف التقديمات والخصومات بحسب المنطقة والجهة والاتفاقات المعتمدة. لا توجد خصومات أو مبالغ مضمونة بمجرد التسجيل، ولا تُطلب أي رسوم أو بيانات بطاقات.": ["Benefits and discounts vary by area, provider, and approved agreements. Registration does not guarantee a discount or payment, and no fees or card details are requested.", "Les avantages et réductions varient selon la région, le prestataire et les accords approuvés. L’inscription ne garantit aucune réduction ni somme, et aucuns frais ni données de carte ne sont demandés.", "Vantaggi e sconti variano in base alla zona, al fornitore e agli accordi approvati. L’iscrizione non garantisce sconti o somme di denaro; non vengono richiesti pagamenti né dati delle carte.", "Angebote und Rabatte hängen von Gebiet, Anbieter und genehmigten Vereinbarungen ab. Eine Registrierung garantiert weder Rabatte noch Geldleistungen; Gebühren oder Kartendaten werden nicht verlangt."],
    "أوافق على استخدام بياناتي للتواصل بشأن الانتساب والتقديمات المتاحة.": ["I agree to the use of my information to contact me about membership and available benefits.", "J’accepte l’utilisation de mes informations pour me contacter au sujet de l’adhésion et des avantages disponibles.", "Acconsento all’uso dei miei dati per essere contattato in merito all’iscrizione e ai vantaggi disponibili.", "Ich stimme der Verwendung meiner Angaben zu, um mich bezüglich Mitgliedschaft und verfügbarer Vorteile zu kontaktieren."],
    "لا ترسل تقارير طبية أو معلومات حساسة غير ضرورية. اكتب وصفاً مختصراً للحاجة فقط.": ["Do not send medical reports or unnecessary sensitive information. Provide only a brief description of the need.", "N’envoyez pas de rapports médicaux ni d’informations sensibles inutiles. Décrivez uniquement brièvement le besoin.", "Non inviare referti medici o informazioni sensibili non necessarie. Descrivi solo brevemente la necessità.", "Senden Sie keine medizinischen Berichte oder unnötigen sensiblen Informationen. Beschreiben Sie nur kurz den Bedarf."],
    "RAFIQ | رفيق — لا يوجد أي رسم للتقديم.": ["RAFIQ | Rafiq — There is no application fee.", "RAFIQ | Rafiq — Aucun frais de candidature.", "RAFIQ | Rafiq — Non è prevista alcuna quota di candidatura.", "RAFIQ | Rafiq — Für die Bewerbung fallen keine Gebühren an."],
    "RAFIQ | رفيق — لا تُنشر الإعلانات قبل اعتماد الإدارة.": ["RAFIQ | Rafiq — Ads are not published before management approval.", "RAFIQ | Rafiq — Les annonces ne sont pas publiées avant l’approbation de la direction.", "RAFIQ | Rafiq — Gli annunci non vengono pubblicati prima dell’approvazione della direzione.", "RAFIQ | Rafiq — Anzeigen werden erst nach Freigabe durch die Leitung veröffentlicht."],
    "RAFIQ | رفيق — جميع الطلبات تخضع لمراجعة الإدارة.": ["RAFIQ | Rafiq — All applications are reviewed by management.", "RAFIQ | Rafiq — Toutes les candidatures sont examinées par la direction.", "RAFIQ | Rafiq — Tutte le candidature sono esaminate dalla direzione.", "RAFIQ | Rafiq — Alle Bewerbungen werden von der Leitung geprüft."],
    "RAFIQ | رفيق — استلام الطلب لا يعني تأكيد توفر الخدمة.": ["RAFIQ | Rafiq — Receiving a request does not confirm service availability.", "RAFIQ | Rafiq — La réception d’une demande ne confirme pas la disponibilité du service.", "RAFIQ | Rafiq — La ricezione della richiesta non conferma la disponibilità del servizio.", "RAFIQ | Rafiq — Der Eingang einer Anfrage bestätigt nicht die Verfügbarkeit der Leistung."],
    "RAFIQ | رفيق — الانتساب لا يضمن توفر خدمة أو خصم في كل منطقة.": ["RAFIQ | Rafiq — Membership does not guarantee a service or discount in every area.", "RAFIQ | Rafiq — L’adhésion ne garantit pas la disponibilité d’un service ou d’une réduction dans chaque région.", "RAFIQ | Rafiq — L’iscrizione non garantisce un servizio o uno sconto in ogni zona.", "RAFIQ | Rafiq — Eine Mitgliedschaft garantiert keine Leistung oder Ermäßigung in jedem Gebiet."],
    "يشترط إدخال بيانات صحيحة وإرفاق السيرة الذاتية والشهادة وصورة الترخيص المهني. تخضع الملفات لمراجعة الإدارة والتحقق قبل أي اعتماد أو تواصل بشأن العمل.": ["Please provide accurate information and attach your CV, certificate, and professional license. Profiles are reviewed and verified by management before approval or work-related contact.", "Veuillez fournir des informations exactes et joindre votre CV, votre diplôme et votre autorisation professionnelle. Les dossiers sont examinés et vérifiés par la direction avant toute validation ou prise de contact professionnelle.", "Inserisci dati accurati e allega il CV, il certificato e la licenza professionale. I profili vengono esaminati e verificati dalla direzione prima dell’approvazione o di contatti lavorativi.", "Bitte machen Sie korrekte Angaben und fügen Sie Lebenslauf, Abschlussnachweis und Berufszulassung bei. Profile werden vor einer Freigabe oder arbeitsbezogenen Kontaktaufnahme von der Leitung geprüft und verifiziert."],
    "نرحب بمن لديهم خبرة في رعاية كبار السن أو المرضى أو ذوي الاحتياجات الخاصة. لا يُطلب أي رسم للتقديم. تخضع الطلبات للمراجعة ولا يعني التسجيل ضمان وظيفة.": ["Applicants with experience caring for older adults, patients, or people with disabilities are welcome. There is no application fee. Applications are reviewed, and registration does not guarantee employment.", "Les personnes ayant de l’expérience auprès des personnes âgées, des patients ou des personnes en situation de handicap sont les bienvenues. Aucun frais de candidature n’est demandé. Les demandes sont examinées et l’inscription ne garantit pas un emploi.", "Sono benvenute le persone con esperienza nell’assistenza ad anziani, pazienti o persone con disabilità. Non è prevista alcuna quota di candidatura. Le richieste vengono esaminate e l’iscrizione non garantisce un impiego.", "Bewerber mit Erfahrung in der Betreuung älterer Menschen, von Patienten oder Menschen mit Behinderungen sind willkommen. Es fällt keine Bewerbungsgebühr an. Bewerbungen werden geprüft; eine Registrierung garantiert keine Beschäftigung."],
    "يرجى إدخال رقم الترخيص والاختصاص والمناطق التي تغطيها، وإرفاق السيرة الذاتية والشهادة المهنية. لا يُعتمد أي ملف قبل مراجعته.": ["Please enter your license number, specialty, and service areas, and attach your CV and professional certificate. No profile is approved before review.", "Veuillez indiquer votre numéro de licence, votre spécialité et les zones couvertes, puis joindre votre CV et votre diplôme professionnel. Aucun dossier n’est validé avant examen.", "Inserisci il numero di licenza, la specializzazione e le zone coperte, e allega il CV e il certificato professionale. Nessun profilo viene approvato prima della verifica.", "Bitte geben Sie Zulassungsnummer, Fachgebiet und Einsatzgebiete an und fügen Sie Lebenslauf und Berufsabschluss bei. Kein Profil wird vor der Prüfung freigegeben."],
    "يرجى إدخال بيانات مهنية صحيحة وإرفاق السيرة الذاتية وإثبات الاختصاص أو المؤهل المهني. جميع الطلبات قيد المراجعة ولا يعني الإرسال اعتماد الملف أو نشره.": ["Please provide accurate professional information and attach your CV and proof of specialty or professional qualification. All applications are under review; submission does not mean approval or publication.", "Veuillez fournir des informations professionnelles exactes et joindre votre CV ainsi qu’une preuve de spécialité ou de qualification. Toutes les candidatures sont en cours d’examen ; l’envoi ne vaut ni validation ni publication.", "Inserisci informazioni professionali accurate e allega il CV e la prova della specializzazione o della qualifica professionale. Tutte le candidature sono in fase di revisione; l’invio non implica approvazione o pubblicazione.", "Bitte geben Sie korrekte berufliche Angaben an und fügen Sie Lebenslauf sowie Nachweis der Fachrichtung oder beruflichen Qualifikation bei. Alle Bewerbungen werden geprüft; das Einreichen bedeutet keine Freigabe oder Veröffentlichung."],
    "رعاية ذوي الاحتياجات الخاصة": ["Care for people with disabilities", "Soins aux personnes en situation de handicap", "Assistenza a persone con disabilità", "Betreuung von Menschen mit Behinderungen"],
    "العربية، الإنجليزية، الفرنسية...": ["Arabic, English, French...", "Arabe, anglais, français...", "Arabo, inglese, francese...", "Arabisch, Englisch, Französisch..."],
    "اكتب الخدمات المتاحة والأسعار كما تعتمدها منشأتك.": ["Enter the services available and the prices approved by your facility.", "Indiquez les services disponibles et les tarifs approuvés par votre établissement.", "Inserisci i servizi disponibili e i prezzi approvati dalla tua struttura.", "Geben Sie die verfügbaren Leistungen und die von Ihrer Einrichtung genehmigten Preise ein."],
    "الأيام والساعات": ["Days and hours", "Jours et heures", "Giorni e orari", "Tage und Uhrzeiten"],
    "وصف عام مختصر دون تفاصيل طبية حساسة.": ["A brief general description without sensitive medical details.", "Une brève description générale sans détails médicaux sensibles.", "Una breve descrizione generale senza dettagli medici sensibili.", "Eine kurze allgemeine Beschreibung ohne sensible medizinische Angaben."]
  };

  function translateSource(text, lang) {
    var normalized = normalizeSource(text);
    if (!normalized) return null;
    var langIndex = { en: 0, fr: 1, it: 2, de: 3 }[lang];
    var extra = PAGE_COPY[normalized];
    if (extra && langIndex !== undefined) return extra[langIndex];
    var key = sourceToKey[normalized];
    return key ? translate(key, lang) : null;
  }

  function translateLegacyPage(lang) {
    rebuildSourceIndex();
    var changed = 0;
    var root = document.querySelector('main') || document.body;
    if (!root) return changed;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest('script,style,template,.ra-lang,[data-i18n]')) continue;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      var raw = originalText.get(node);
      var translated = lang === DEFAULT ? raw : translateSource(raw, lang);
      var next = translated || raw;
      if (node.nodeValue !== next) { node.nodeValue = next; changed++; }
    }
    return changed;
  }

  function translateAttributes(lang) {
    var changed = 0;
    var attrs = ['title','alt','aria-label','placeholder'];
    var els = document.querySelectorAll('[title],[alt],[aria-label]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.ra-lang,script,style,template')) continue;
      for (var j = 0; j < attrs.length; j++) {
        var name = attrs[j];
        if (!el.hasAttribute(name)) continue;
        var cache = originalAttributes.get(el);
        if (!cache) { cache = Object.create(null); originalAttributes.set(el, cache); }
        if (!Object.prototype.hasOwnProperty.call(cache, name)) cache[name] = el.getAttribute(name);
        var raw = cache[name];
        var val = lang === DEFAULT ? raw : (translateSource(raw, lang) || raw);
        if (el.getAttribute(name) !== val) { el.setAttribute(name, val); changed++; }
      }
    }
    return changed;
  }

  /* Apply a language to the current page */
  function apply(code, opts) {
    opts = opts || {};
    // an unknown code must never blank the page: fall back to the source
    if (!isKnown(code)) code = DEFAULT;
    current = code;
    write(code);

    var m = langMeta(code);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', m.dir);
    document.documentElement.classList.toggle('ra-ltr', m.dir === 'ltr');

    // a translated <title> when we have one
    var titleKey = document.body.getAttribute('data-i18n-title');
    var t = titleKey ? translate(titleKey, code) : null;
    if (!t && code !== DEFAULT) t = translateSource(originalTitle, code);
    document.title = t || originalTitle;

    // fill every marked string; anything without a translation keeps
    // whatever the page already had, which is the Arabic original
    var marked = document.querySelectorAll('[data-i18n]');
    var filled = 0, missing = 0;
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var key = el.getAttribute('data-i18n');
      if (!originalMarkedText.has(el)) originalMarkedText.set(el, el.textContent);
      var sourceText = originalMarkedText.get(el);
      var val = code === DEFAULT ? sourceText : translate(key, code);
      if (val !== null && val !== '') { if (el.textContent !== val) el.textContent = val; filled++; }
      else { el.textContent = sourceText; missing++; }
    }

    // Translate legacy pages that predate data-i18n markers.
    var legacyFilled = translateLegacyPage(code);
    var attributeFilled = translateAttributes(code);
    filled += legacyFilled + attributeFilled;

    // placeholder attributes, so inputs are never in the wrong language
    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      var sourcePlaceholder = ph[j].getAttribute('data-i18n-placeholder-source') || ph[j].getAttribute('placeholder') || '';
      if (!ph[j].hasAttribute('data-i18n-placeholder-source')) ph[j].setAttribute('data-i18n-placeholder-source', sourcePlaceholder);
      var p = code === DEFAULT ? sourcePlaceholder : translate(ph[j].getAttribute('data-i18n-placeholder'), code);
      ph[j].setAttribute('placeholder', p || sourcePlaceholder);
    }

    // aria-labels
    var al = document.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < al.length; k++) {
      var sourceAria = al[k].getAttribute('data-i18n-aria-source') || al[k].getAttribute('aria-label') || '';
      if (!al[k].hasAttribute('data-i18n-aria-source')) al[k].setAttribute('data-i18n-aria-source', sourceAria);
      var a = code === DEFAULT ? sourceAria : translate(al[k].getAttribute('data-i18n-aria'), code);
      al[k].setAttribute('aria-label', a || sourceAria);
    }

    // tell the page - and anything that renders its own text, such as the
    // install hint - that the language just changed
    document.dispatchEvent(new CustomEvent('rafiq:i18n', {
      detail: { lang: code, dir: m.dir, filled: filled, missing: missing }
    }));
    if (!opts.silent) showBanner(code, missing, filled);
    return { lang: code, dir: m.dir, filled: filled, missing: missing };
  }

  /* How much of the visible page is still Arabic?
     Counting missing keys is not enough: a page can have every shared
     label translated and still be almost entirely Arabic. So measure the
     Arabic text that is actually on screen, ignoring the language menu
     itself (which always shows each language in its own language) and
     anything not rendered, such as the contents of a <template>.

     Returns both the Arabic count and the total, because what matters is
     the share of the page, not an absolute number: a 260-character page
     that is entirely Arabic needs the notice just as much as a long one. */
  var ARABIC = /[؀-ۿݐ-ݿ]/;
  function arabicShare() {
    var root = document.querySelector('main') || document.body;
    if (!root) return { arabic: 0, total: 0, ratio: 0 };

    var arabic = 0, total = 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var s = node.nodeValue;
        if (!s || !s.trim()) return NodeFilter.FILTER_REJECT;
        var el = node.parentElement;
        if (!el || el.closest('.ra-lang, script, style')) return NodeFilter.FILTER_REJECT;
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.trim().length;
      total += len;
      if (ARABIC.test(node.nodeValue)) arabic += len;
    }
    return { arabic: arabic, total: total, ratio: total ? arabic / total : 0 };
  }

  function showBanner(code, missing, filled) {
    var old = document.querySelector('.ra-untranslated');
    if (old) old.remove();
    if (code === DEFAULT) return;              // Arabic is the source language

    // Internal tooling (admin, dashboard, barcode) and the error page are
    // used by the manager only. Putting "this page is still in Arabic" at
    // the top of a page nobody should be on would only advertise it, so
    // those pages opt out with data-rafiq-internal on <body>.
    if (document.body && document.body.hasAttribute('data-rafiq-internal')) return;

    // More than a tenth of the page still in Arabic means a visitor will
    // hit text they cannot read. A few stray labels do not.
    var share = arabicShare();
    var mostlyArabic = share.arabic > 40 && share.ratio > 0.10;
    if (!mostlyArabic && !missing) return;

    var b = document.createElement('p');
    b.className = 'ra-untranslated';
    b.textContent = translate(mostlyArabic ? 'notice.page' : 'notice.partial', code) ||
      (mostlyArabic
        ? 'The navigation is translated, but the text of this page is still in Arabic.'
        : 'Some sections on this page are still shown in Arabic.');
    var main = document.querySelector('main');
    (main || document.body).insertBefore(b, main ? main.firstChild : document.body.firstChild);
  }

  /* ---------------- the switcher button ---------------- */
  function buildButton() {
    if (document.querySelector('.ra-lang')) return;
    var meta = langMeta(current);

    // the bar spans the page; the inner group holds the button and the
    // menu hangs off the button, not off the far edge of the screen
    var bar = document.createElement('div');
    bar.className = 'ra-lang';

    var wrap = document.createElement('div');
    wrap.className = 'ra-lang-inner';
    wrap.style.cssText = 'position:relative;display:inline-block';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ra-lang-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Language / اللغة');
    btn.innerHTML =
      '<span class="gl">' + meta.flag + '</span>' +
      '<span class="lbl"></span>' +
      '<span aria-hidden="true">▾</span>';

    var menu = document.createElement('div');
    menu.className = 'ra-lang-menu';
    menu.hidden = true;

    LANGS.forEach(function (L) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = L.code;
      b.innerHTML = '<span class="gl">' + L.flag + '</span>' +
                    '<span class="nm"></span>' +
                    '<span class="tick" aria-hidden="true">✓</span>';
      b.addEventListener('click', function () {
        close();
        setLanguage(L.code);
      });
      menu.appendChild(b);
    });

    var note = document.createElement('div');
    note.className = 'note';
    menu.appendChild(note);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    bar.appendChild(wrap);
    var host = document.querySelector('.topbar');
    if (host) host.insertBefore(bar, host.firstChild);
    else document.body.appendChild(bar);

    function open() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    // tapping anywhere else closes it, but a tap inside the menu is a
    // language choice, so stop it from reaching the document handler
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function (e) {
      if (!bar.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') close();
    });

    paintButton(btn, menu, note, current);
  }

  function paintButton(btn, menu, note, code) {
    var m = langMeta(code);
    btn.querySelector('.gl').textContent = m.flag;
    var lbl = btn.querySelector('.lbl');
    // the button label is always in its own language, so it is never lost
    lbl.textContent = m.label;
    Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      var L = langMeta(b.dataset.lang);
      b.querySelector('.nm').textContent = L.label;
      b.setAttribute('aria-current', String(b.dataset.lang === code));
      b.querySelector('.tick').style.visibility = b.dataset.lang === code ? 'visible' : 'hidden';
    });
    var nt = translate('lang.note', code);
    if (nt !== null) note.textContent = nt;
  }

  function setLanguage(code) {
    if (!isKnown(code)) code = DEFAULT;
    var run = function () {
      var r = apply(code);
      var w = document.querySelector('.ra-lang');
      if (w) paintButton(w.querySelector('.ra-lang-btn'), w.querySelector('.ra-lang-menu'),
                         w.querySelector('.note'), code);
      return r;
    };
    if (bundles[code] || code === DEFAULT) return run();
    return loadScript(code).then(function () { return run(); });
  }

  function start() {
    var saved = read();
    var auto = false;
    var want;
    if (saved && isKnown(saved)) {
      want = saved;                     // an explicit choice always wins
    } else {
      want = detect();                  // first visit: follow the browser
      auto = detected !== null;
      write(want);                      // and remember it from now on
    }
    buildButton();
    return Promise.all([loadScript(DEFAULT), loadScript(want)]).then(function () {
      var r = setLanguage(want);
      r.auto = auto;
      r.detected = detected;
      return r;
    });
  }

  return {
    start: start,
    setLanguage: setLanguage,
    apply: apply,
    register: register,
    translate: translate,
    langMeta: langMeta,
    isKnown: isKnown,
    detect: detect,
    LANGS: LANGS,
    get current() { return current; },
    get detected() { return detected; },
    version: '4'
  };
})();

if (typeof globalThis !== 'undefined') globalThis.RAFIQ_I18N = RAFIQ_I18N;

/* Start automatically on every public page. */
(function () {
  function boot() { try { RAFIQ_I18N.start(); } catch (e) { console.error('RAFIQ i18n boot failed', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RAFIQ_I18N;