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
  var originalDocumentTitle = '';

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
    var code = lang || current;
    var d = bundles[code];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    var extra = extraTranslationsByKey[key];
    return extra && extra[code] ? extra[code] : null;
  }

  var extraTranslationsByKey = Object.create(null);
  Object.keys(extraTranslations).forEach(function (source) {
    var key = 'extra.' + Object.keys(extraTranslationsByKey).length;
    extraTranslationsByKey[key] = extraTranslations[source];
  });

  /* Some older public pages were written before data-i18n markers were
     added. Their Arabic copy is still valid source copy, so translate it
     by looking it up in the Arabic source bundle. This keeps old pages
     compatible without rewriting their SEO/content structure. */
  var sourceToKey = Object.create(null);
  var originalTextNodes = new WeakMap();
  var originalAttributes = new WeakMap();
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


  /* Current public directory pages: reviewed translations for the approved
     directory model. Keys are matched against the original Arabic text so
     older pages remain compatible without changing their content structure. */
  var extraTranslations = {
    'دليل المراكز والخدمات الطبية المعتمدة': {
      en:'Directory of approved medical centres and services',
      fr:'Annuaire des centres et services médicaux agréés',
      it:'Elenco dei centri e servizi medici approvati',
      de:'Verzeichnis zugelassener medizinischer Zentren und Dienste'
    },
    'منصة RAFIQ معلوماتية وإعلانية. تعرض المراكز والخدمات التي راجعتها الإدارة واعتمدت بياناتها فقط.': {
      en:'RAFIQ is an information and advertising platform. It lists only centres and services reviewed by the administration and whose details have been approved.',
      fr:'RAFIQ est une plateforme d’information et de publicité. Elle présente uniquement les centres et services examinés par l’administration et dont les informations ont été approuvées.',
      it:'RAFIQ è una piattaforma informativa e pubblicitaria. Elenca solo centri e servizi verificati dall’amministrazione e con dati approvati.',
      de:'RAFIQ ist eine Informations- und Werbeplattform. Sie führt nur Zentren und Dienste auf, deren Angaben von der Verwaltung geprüft und freigegeben wurden.'
    },
    'لا يستقبل الموقع طلبات رعاية منزلية أو انتساب أو توظيف أو تسجيل مراكز أو حجوزات. للاستفسار عن خدمة CV وCover Letter، استخدم الصفحة المخصصة لها.': {
      en:'This website does not accept home-care requests, memberships, job applications, centre registrations or bookings. For CV and cover-letter services, use the dedicated page.',
      fr:'Ce site n’accepte pas les demandes de soins à domicile, adhésions, candidatures, inscriptions de centres ni réservations. Pour le service CV et lettre de motivation, utilisez la page dédiée.',
      it:'Questo sito non accetta richieste di assistenza domiciliare, adesioni, candidature, registrazioni di centri o prenotazioni. Per il servizio CV e lettera di presentazione, usa la pagina dedicata.',
      de:'Diese Website nimmt keine Anfragen für häusliche Pflege, Mitgliedschaften, Bewerbungen, Zentrumsregistrierungen oder Buchungen entgegen. Für Lebensläufe und Anschreiben nutzen Sie bitte die dafür vorgesehene Seite.'
    },
    'المختبرات الطبية': {en:'Medical laboratories',fr:'Laboratoires médicaux',it:'Laboratori medici',de:'Medizinische Labore'},
    'مختبرات التحاليل والفحوصات الطبية المعتمدة بحسب المنطقة.': {en:'Approved medical testing and analysis laboratories by area.',fr:'Laboratoires agréés d’analyses et d’examens médicaux par région.',it:'Laboratori approvati per analisi ed esami medici suddivisi per zona.',de:'Zugelassene medizinische Analyse- und Untersuchungslabore nach Region.'},
    'الأشعة والتصوير': {en:'Radiology and imaging',fr:'Radiologie et imagerie',it:'Radiologia e diagnostica per immagini',de:'Radiologie und Bildgebung'},
    'مراكز الأشعة والتصوير الطبي بعد التحقق من بياناتها.': {en:'Radiology and medical imaging centres whose details have been verified.',fr:'Centres de radiologie et d’imagerie médicale dont les informations ont été vérifiées.',it:'Centri di radiologia e diagnostica per immagini con dati verificati.',de:'Radiologie- und Bildgebungszentren mit geprüften Angaben.'},
    'مراكز العلاج الفيزيائي': {en:'Physiotherapy centres',fr:'Centres de physiothérapie',it:'Centri di fisioterapia',de:'Physiotherapiezentren'},
    'مراكز العلاج والتأهيل الفيزيائي المعتمدة.': {en:'Approved physiotherapy and rehabilitation centres.',fr:'Centres agréés de physiothérapie et de rééducation.',it:'Centri approvati di fisioterapia e riabilitazione.',de:'Zugelassene Physiotherapie- und Rehabilitationszentren.'},
    'المعدات الطبية': {en:'Medical equipment',fr:'Équipements médicaux',it:'Attrezzature mediche',de:'Medizinische Geräte'},
    'مراكز بيع المعدات الطبية وتأجيرها.': {en:'Centres selling and renting medical equipment.',fr:'Centres de vente et de location de matériel médical.',it:'Centri per la vendita e il noleggio di attrezzature mediche.',de:'Zentren für den Verkauf und Verleih medizinischer Geräte.'},
    'فتح الفئة': {en:'Open category',fr:'Voir la catégorie',it:'Apri categoria',de:'Kategorie öffnen'},
    'الإعلانات والعروض والخصومات': {en:'Advertisements, offers and discounts',fr:'Publicités, offres et réductions',it:'Pubblicità, offerte e sconti',de:'Anzeigen, Angebote und Rabatte'},
    'لا تُنشر أسماء المراكز أو الإعلانات أو الأسعار أو العروض إلا بعد مراجعة الإدارة وموافقتها. تختلف الخصومات بحسب نوع الخدمة والسعر الفعلي لدى المركز؛ لا توجد نسبة موحدة أو كود قبل الاعتماد. كل كود معتمد صالح لاستخدام واحد فقط.': {
      en:'Centre names, advertisements, prices and offers are published only after administrative review and approval. Discounts depend on the service and the centre’s actual price; no standard rate or code is offered before approval. Each approved code is valid for one use only.',
      fr:'Les noms des centres, publicités, prix et offres ne sont publiés qu’après examen et approbation de l’administration. Les réductions varient selon le service et le prix réel du centre ; aucun taux ni code standard n’est proposé avant validation. Chaque code approuvé est valable pour une seule utilisation.',
      it:'Nomi dei centri, annunci, prezzi e offerte vengono pubblicati solo dopo la verifica e l’approvazione dell’amministrazione. Gli sconti variano in base al servizio e al prezzo effettivo del centro; non esistono percentuali o codici standard prima dell’approvazione. Ogni codice approvato è valido per un solo utilizzo.',
      de:'Namen von Zentren, Anzeigen, Preise und Angebote werden erst nach Prüfung und Freigabe durch die Verwaltung veröffentlicht. Rabatte richten sich nach Leistung und tatsächlichem Preis des Zentrums; vor der Freigabe gibt es weder einen Einheitssatz noch einen Code. Jeder genehmigte Code ist nur einmal gültig.'
    },
    'التواصل الرسمي': {en:'Official contact',fr:'Contact officiel',it:'Contatti ufficiali',de:'Offizieller Kontakt'},
    'بوت RAFIQ على Telegram': {en:'RAFIQ Telegram bot',fr:'Bot Telegram RAFIQ',it:'Bot Telegram RAFIQ',de:'RAFIQ-Telegram-Bot'},
    'قناة Telegram': {en:'Telegram channel',fr:'Chaîne Telegram',it:'Canale Telegram',de:'Telegram-Kanal'},
    'قناة WhatsApp': {en:'WhatsApp channel',fr:'Chaîne WhatsApp',it:'Canale WhatsApp',de:'WhatsApp-Kanal'},
    'WhatsApp الإدارة': {en:'Management WhatsApp',fr:'WhatsApp de l’administration',it:'WhatsApp dell’amministrazione',de:'WhatsApp der Verwaltung'},
    'فئات الدليل الطبي': {en:'Medical directory categories',fr:'Catégories de l’annuaire médical',it:'Categorie dell’elenco medico',de:'Kategorien des medizinischen Verzeichnisses'},
    'دليل للمختبرات الطبية وخدمات التحاليل والفحوصات في لبنان.': {en:'A directory of medical laboratories and testing services in Lebanon.',fr:'Un annuaire des laboratoires médicaux et des services d’analyses au Liban.',it:'Un elenco di laboratori medici e servizi di analisi in Libano.',de:'Ein Verzeichnis medizinischer Labore und Untersuchungsdienste im Libanon.'},
    'دليل مراكز الأشعة والتصوير الطبي والخدمات المتاحة في لبنان.': {en:'A directory of radiology and medical imaging centres and services available in Lebanon.',fr:'Un annuaire des centres et services de radiologie et d’imagerie médicale disponibles au Liban.',it:'Un elenco dei centri e servizi di radiologia e diagnostica per immagini disponibili in Libano.',de:'Ein Verzeichnis der in Libanon verfügbaren Radiologie- und Bildgebungszentren und -dienste.'},
    'دليل مراكز العلاج والتأهيل الفيزيائي في لبنان بحسب المنطقة.': {en:'A directory of physiotherapy and rehabilitation centres in Lebanon by area.',fr:'Un annuaire des centres de physiothérapie et de rééducation au Liban, par région.',it:'Un elenco dei centri di fisioterapia e riabilitazione in Libano per zona.',de:'Ein Verzeichnis von Physiotherapie- und Rehabilitationszentren im Libanon nach Region.'},
    'دليل مراكز بيع المعدات الطبية وتأجيرها في لبنان.': {en:'A directory of medical equipment sales and rental centres in Lebanon.',fr:'Un annuaire des centres de vente et de location de matériel médical au Liban.',it:'Un elenco dei centri di vendita e noleggio di attrezzature mediche in Libano.',de:'Ein Verzeichnis von Verkaufs- und Verleihzentren für medizinische Geräte im Libanon.'},
    'لا يوجد نموذج تقديم أو تسجيل في هذه الصفحة. تُعرض بيانات المراكز والعروض فقط بعد مراجعة إدارة RAFIQ والموافقة عليها.': {
      en:'There is no application or registration form on this page. Centre details and offers are displayed only after review and approval by RAFIQ management.',
      fr:'Cette page ne comporte aucun formulaire de candidature ou d’inscription. Les informations sur les centres et les offres ne sont affichées qu’après examen et approbation de l’administration RAFIQ.',
      it:'Questa pagina non contiene moduli di candidatura o registrazione. I dati dei centri e le offerte vengono mostrati solo dopo la verifica e l’approvazione dell’amministrazione RAFIQ.',
      de:'Diese Seite enthält kein Bewerbungs- oder Registrierungsformular. Angaben zu Zentren und Angebote werden erst nach Prüfung und Freigabe durch die RAFIQ-Verwaltung angezeigt.'
    },
    'ستُضاف المراكز المعتمدة إلى الدليل بحسب المنطقة عند اكتمال مراجعة بياناتها.': {
      en:'Approved centres will be added to the directory by area once their details have been reviewed.',
      fr:'Les centres agréés seront ajoutés à l’annuaire par région une fois leurs informations vérifiées.',
      it:'I centri approvati saranno aggiunti all’elenco per zona una volta verificati i loro dati.',
      de:'Zugelassene Zentren werden nach Prüfung ihrer Angaben nach Region in das Verzeichnis aufgenommen.'
    },
    'تقييم الحالة والخطة العلاجية من اختصاص المعالج الفيزيائي والفريق الطبي المعالج. لا يقدم RAFIQ تشخيصًا أو خطة علاج.': {
      en:'Assessment and treatment planning are the responsibility of the physiotherapist and treating medical team. RAFIQ does not provide diagnoses or treatment plans.',
      fr:'L’évaluation et le plan de traitement relèvent du physiothérapeute et de l’équipe médicale traitante. RAFIQ ne fournit ni diagnostic ni plan de traitement.',
      it:'La valutazione e il piano terapeutico competono al fisioterapista e all’équipe medica curante. RAFIQ non fornisce diagnosi né piani di trattamento.',
      de:'Beurteilung und Behandlungsplanung obliegen dem Physiotherapeuten und dem behandelnden Ärzteteam. RAFIQ stellt keine Diagnosen und erstellt keine Behandlungspläne.'
    },
    'الأسئلة الشائعة حول دليل RAFIQ': {en:'Frequently asked questions about the RAFIQ directory',fr:'Questions fréquentes sur l’annuaire RAFIQ',it:'Domande frequenti sull’elenco RAFIQ',de:'Häufige Fragen zum RAFIQ-Verzeichnis'},
    'ما الخدمات التي يشملها الدليل؟': {en:'Which services are included in the directory?',fr:'Quels services figurent dans l’annuaire ?',it:'Quali servizi sono inclusi nell’elenco?',de:'Welche Dienste umfasst das Verzeichnis?'},
    'المختبرات الطبية، مراكز الأشعة والتصوير، مراكز العلاج الفيزيائي، ومراكز بيع وتأجير المعدات الطبية.': {en:'Medical laboratories, radiology and imaging centres, physiotherapy centres, and medical equipment sales and rental centres.',fr:'Laboratoires médicaux, centres de radiologie et d’imagerie, centres de physiothérapie et centres de vente et de location de matériel médical.',it:'Laboratori medici, centri di radiologia e diagnostica per immagini, centri di fisioterapia e centri di vendita e noleggio di attrezzature mediche.',de:'Medizinische Labore, Radiologie- und Bildgebungszentren, Physiotherapiezentren sowie Verkaufs- und Verleihzentren für medizinische Geräte.'},
    'هل كل مركز أو عرض يظهر في المنصة معتمد؟': {en:'Is every centre or offer shown on the platform approved?',fr:'Chaque centre ou offre présenté sur la plateforme est-il agréé ?',it:'Ogni centro o offerta mostrata sulla piattaforma è approvata?',de:'Ist jedes auf der Plattform angezeigte Zentrum und Angebot zugelassen?'},
    'لا يُنشر أي مركز أو عرض أو خصم قبل مراجعة إدارة RAFIQ والموافقة عليه.': {en:'No centre, offer or discount is published before review and approval by RAFIQ management.',fr:'Aucun centre, offre ou réduction n’est publié avant examen et approbation de l’administration RAFIQ.',it:'Nessun centro, offerta o sconto viene pubblicato prima della verifica e dell’approvazione dell’amministrazione RAFIQ.',de:'Kein Zentrum, Angebot oder Rabatt wird ohne vorherige Prüfung und Freigabe durch die RAFIQ-Verwaltung veröffentlicht.'},
    'كيف أتأكد من قيمة الخصم؟': {en:'How can I confirm the discount amount?',fr:'Comment vérifier le montant de la réduction ?',it:'Come posso verificare l’importo dello sconto?',de:'Wie kann ich die Höhe des Rabatts überprüfen?'},
    'تُعرض قيمة الخصم وشروطه بعد اعتمادها من الإدارة. لا تعتمد على أي قيمة غير منشورة رسميًا في دليل RAFIQ.': {en:'The discount amount and terms are displayed after management approval. Do not rely on any amount that has not been officially published in the RAFIQ directory.',fr:'Le montant et les conditions de la réduction sont affichés après validation par l’administration. Ne vous fiez à aucun montant qui n’a pas été officiellement publié dans l’annuaire RAFIQ.',it:'L’importo e le condizioni dello sconto vengono mostrati dopo l’approvazione dell’amministrazione. Non fare affidamento su importi non pubblicati ufficialmente nell’elenco RAFIQ.',de:'Rabattbetrag und Bedingungen werden nach Freigabe durch die Verwaltung angezeigt. Verlassen Sie sich nicht auf Beträge, die nicht offiziell im RAFIQ-Verzeichnis veröffentlicht wurden.'},
    'هل يدفع العميل إلى RAFIQ؟': {en:'Does the customer pay RAFIQ?',fr:'Le client paie-t-il RAFIQ ?',it:'Il cliente paga RAFIQ?',de:'Zahlt der Kunde an RAFIQ?'},
    'لا. يدفع العميل إلى المركز مباشرة. RAFIQ لا تستلم أموال العملاء ولا تنفذ تحويلات مالية نيابة عنهم.': {en:'No. The customer pays the centre directly. RAFIQ does not receive customer funds or make financial transfers on their behalf.',fr:'Non. Le client paie directement le centre. RAFIQ ne reçoit pas l’argent des clients et n’effectue aucun transfert en leur nom.',it:'No. Il cliente paga direttamente il centro. RAFIQ non riceve denaro dai clienti né effettua trasferimenti per loro conto.',de:'Nein. Der Kunde bezahlt das Zentrum direkt. RAFIQ nimmt keine Kundengelder entgegen und führt keine Überweisungen in deren Namen aus.'},
    'هل يمكن إصدار كود خصم؟': {en:'Can a discount code be issued?',fr:'Un code de réduction peut-il être émis ?',it:'È possibile emettere un codice sconto?',de:'Kann ein Rabattcode ausgestellt werden?'},
    'يصدر الكود بعد اعتماد الإدارة لقيمة الخصم وشروطه والمركز. الكود مخصص لاستخدام واحد ويُغلق بعد تأكيد تنفيذ الخدمة.': {en:'A code is issued only after management approves the discount amount, terms and centre. It is valid for one use and is closed after the service is confirmed as completed.',fr:'Le code est émis uniquement après validation par l’administration du montant, des conditions et du centre. Il est valable pour une seule utilisation et est désactivé après confirmation du service.',it:'Il codice viene emesso solo dopo l’approvazione dell’importo, delle condizioni e del centro da parte dell’amministrazione. È valido per un solo utilizzo e viene disattivato dopo la conferma del servizio.',de:'Der Code wird erst ausgestellt, nachdem die Verwaltung Rabattbetrag, Bedingungen und Zentrum freigegeben hat. Er ist einmalig verwendbar und wird nach Bestätigung der Leistung deaktiviert.'},
    'ما المناطق التي يغطيها الدليل؟': {en:'Which areas does the directory cover?',fr:'Quelles régions l’annuaire couvre-t-il ?',it:'Quali zone copre l’elenco?',de:'Welche Regionen deckt das Verzeichnis ab?'},
    'طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان تدريجيًا وفق المراكز المعتمدة.': {en:'Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut and the rest of Lebanon progressively as centres are approved.',fr:'Tripoli, la Dinniyeh, Zgharta, Koura, Batroun, Beyrouth et progressivement le reste du Liban selon les centres agréés.',it:'Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut e gradualmente il resto del Libano in base ai centri approvati.',de:'Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut und schrittweise weitere Gebiete des Libanon entsprechend den zugelassenen Zentren.'},
    'هل يقدم RAFIQ تشخيصًا أو وصفات طبية؟': {en:'Does RAFIQ provide diagnoses or prescriptions?',fr:'RAFIQ fournit-elle des diagnostics ou des ordonnances ?',it:'RAFIQ fornisce diagnosi o prescrizioni?',de:'Stellt RAFIQ Diagnosen oder Rezepte aus?'},
    'لا. الدليل لا يشخّص ولا يصف دواء ولا يغيّر العلاج. في الحالات الطارئة يجب التواصل فورًا مع الإسعاف أو الفريق الطبي المعالج.': {en:'No. The directory does not diagnose, prescribe medication or change treatment. In an emergency, contact emergency services or the treating medical team immediately.',fr:'Non. L’annuaire ne pose pas de diagnostic, ne prescrit aucun médicament et ne modifie aucun traitement. En cas d’urgence, contactez immédiatement les services d’urgence ou l’équipe médicale traitante.',it:'No. L’elenco non formula diagnosi, non prescrive farmaci e non modifica le cure. In caso di emergenza, contatta immediatamente i servizi di emergenza o l’équipe medica curante.',de:'Nein. Das Verzeichnis stellt keine Diagnosen, verschreibt keine Medikamente und ändert keine Behandlung. Im Notfall wenden Sie sich sofort an den Rettungsdienst oder das behandelnde Ärzteteam.'},
    'هل يستقبل الموقع طلبات تسجيل أو انتساب؟': {en:'Does the website accept registration or membership requests?',fr:'Le site accepte-t-il les demandes d’inscription ou d’adhésion ?',it:'Il sito accetta richieste di registrazione o adesione?',de:'Nimmt die Website Registrierungs- oder Mitgliedschaftsanfragen entgegen?'},
    'لا. أُزيلت نماذج التقديم والتسجيل العامة. تبقى خدمة CV وCover Letter مستقلة عن دليل المراكز.': {en:'No. Public application and registration forms have been removed. The CV and cover-letter service remains separate from the centre directory.',fr:'Non. Les formulaires publics de candidature et d’inscription ont été supprimés. Le service de CV et de lettre de motivation reste indépendant de l’annuaire des centres.',it:'No. I moduli pubblici di candidatura e registrazione sono stati rimossi. Il servizio CV e lettera di presentazione resta separato dall’elenco dei centri.',de:'Nein. Öffentliche Bewerbungs- und Registrierungsformulare wurden entfernt. Der Lebenslauf- und Anschreibenservice bleibt vom Zentrumsverzeichnis getrennt.'},
    'كيف تستخدم دليل RAFIQ؟': {en:'How to use the RAFIQ directory',fr:'Comment utiliser l’annuaire RAFIQ',it:'Come utilizzare l’elenco RAFIQ',de:'So verwenden Sie das RAFIQ-Verzeichnis'},
    '1. اختر نوع الخدمة': {en:'1. Choose a service category',fr:'1. Choisissez une catégorie de service',it:'1. Scegli una categoria di servizio',de:'1. Wählen Sie eine Dienstleistungskategorie'},
    'مختبر طبي، أشعة وتصوير، علاج فيزيائي، بيع معدات طبية، أو تأجير معدات طبية.': {en:'Medical laboratory, radiology and imaging, physiotherapy, medical equipment sales or medical equipment rental.',fr:'Laboratoire médical, radiologie et imagerie, physiothérapie, vente ou location de matériel médical.',it:'Laboratorio medico, radiologia e diagnostica per immagini, fisioterapia, vendita o noleggio di attrezzature mediche.',de:'Medizinisches Labor, Radiologie und Bildgebung, Physiotherapie, Verkauf oder Verleih medizinischer Geräte.'},
    '2. اختر المنطقة': {en:'2. Choose an area',fr:'2. Choisissez une région',it:'2. Scegli una zona',de:'2. Wählen Sie eine Region'},
    'تصفح طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان.': {en:'Browse Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut and the rest of Lebanon.',fr:'Parcourez Tripoli, la Dinniyeh, Zgharta, Koura, Batroun, Beyrouth et le reste du Liban.',it:'Consulta Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut e il resto del Libano.',de:'Durchsuchen Sie Tripoli, Dinniyeh, Zgharta, Koura, Batroun, Beirut und weitere Gebiete des Libanon.'},
    '3. راجع المركز والعرض': {en:'3. Review the centre and offer',fr:'3. Consultez le centre et l’offre',it:'3. Esamina il centro e l’offerta',de:'3. Prüfen Sie das Zentrum und das Angebot'},
    'تعرض المنصة بيانات المراكز والعروض التي راجعتها إدارة RAFIQ واعتمدتها فقط.': {en:'The platform displays only centre details and offers reviewed and approved by RAFIQ management.',fr:'La plateforme affiche uniquement les informations et offres des centres examinées et approuvées par l’administration RAFIQ.',it:'La piattaforma mostra solo i dati e le offerte dei centri verificati e approvati dall’amministrazione RAFIQ.',de:'Die Plattform zeigt nur Angaben und Angebote von Zentren, die von der RAFIQ-Verwaltung geprüft und freigegeben wurden.'},
    '4. تواصل وادفع للمركز مباشرة': {en:'4. Contact and pay the centre directly',fr:'4. Contactez le centre et payez-le directement',it:'4. Contatta e paga direttamente il centro',de:'4. Kontaktieren Sie das Zentrum und bezahlen Sie direkt dort'},
    'يتواصل العميل مع المركز ويدفع له مباشرة. RAFIQ لا تستلم أموال العملاء ولا تنفذ التحويلات.': {en:'The customer contacts and pays the centre directly. RAFIQ does not receive customer funds or make transfers.',fr:'Le client contacte le centre et le paie directement. RAFIQ ne reçoit pas l’argent des clients et n’effectue aucun transfert.',it:'Il cliente contatta e paga direttamente il centro. RAFIQ non riceve denaro dai clienti né effettua trasferimenti.',de:'Der Kunde kontaktiert und bezahlt das Zentrum direkt. RAFIQ nimmt keine Kundengelder entgegen und führt keine Überweisungen aus.'},
    'أي خصم أو كود استخدام يجب أن يكون معتمدًا من الإدارة. الكود مخصص لاستخدام واحد ويُغلق بعد تأكيد إتمام الخدمة من المركز.': {en:'Any discount or use code must be approved by management. Each code is for one use and is closed after the centre confirms that the service was completed.',fr:'Toute réduction ou code doit être approuvé par l’administration. Chaque code est à usage unique et est désactivé après confirmation de la réalisation du service par le centre.',it:'Qualsiasi sconto o codice deve essere approvato dall’amministrazione. Ogni codice è monouso e viene disattivato dopo la conferma del centro dell’avvenuta prestazione.',de:'Jeder Rabatt oder Nutzungscode muss von der Verwaltung freigegeben werden. Jeder Code ist einmalig und wird deaktiviert, sobald das Zentrum die Leistung bestätigt hat.'},
    'لا يستقبل الموقع طلبات رعاية أو انتساب أو تسجيل مراكز. خدمة CV وCover Letter مستقلة عن دليل المراكز.': {en:'The website does not accept care requests, memberships or centre registrations. The CV and cover-letter service is separate from the directory.',fr:'Le site n’accepte ni demandes de soins, ni adhésions, ni inscriptions de centres. Le service CV et lettre de motivation est indépendant de l’annuaire.',it:'Il sito non accetta richieste di assistenza, adesioni o registrazioni di centri. Il servizio CV e lettera di presentazione è separato dall’elenco.',de:'Die Website nimmt keine Pflegeanfragen, Mitgliedschaften oder Zentrumsregistrierungen entgegen. Der Lebenslauf- und Anschreibenservice ist vom Verzeichnis getrennt.'},
    'افتح بوت RAFIQ': {en:'Open the RAFIQ bot',fr:'Ouvrir le bot RAFIQ',it:'Apri il bot RAFIQ',de:'RAFIQ-Bot öffnen'},
    'خدمة CV وCover Letter': {en:'CV and cover-letter service',fr:'Service CV et lettre de motivation',it:'Servizio CV e lettera di presentazione',de:'Lebenslauf- und Anschreibenservice'},
    'الرئيسية': {en:'Home',fr:'Accueil',it:'Home',de:'Startseite'},
    'المناطق': {en:'Areas',fr:'Régions',it:'Aree',de:'Regionen'},
    'الأسئلة الشائعة': {en:'FAQ',fr:'FAQ',it:'Domande frequenti',de:'Häufige Fragen'},
    'فئات الدليل': {en:'Directory categories',fr:'Catégories de l’annuaire',it:'Categorie dell’elenco',de:'Verzeichniskategorien'},
    'بوت RAFIQ': {en:'RAFIQ bot',fr:'Bot RAFIQ',it:'Bot RAFIQ',de:'RAFIQ-Bot'},
    'واتساب RAFIQ': {en:'RAFIQ WhatsApp',fr:'WhatsApp RAFIQ',it:'WhatsApp RAFIQ',de:'RAFIQ-WhatsApp'},
    'واتساب الإدارة': {en:'Management WhatsApp',fr:'WhatsApp de l’administration',it:'WhatsApp dell’amministrazione',de:'WhatsApp der Verwaltung'},
    'خدمات CV وCover Letters من RAFIQ': {en:'CV and cover-letter services by RAFIQ',fr:'Services CV et lettres de motivation RAFIQ',it:'Servizi CV e lettere di presentazione RAFIQ',de:'Lebenslauf- und Anschreibenservices von RAFIQ'},
    'إعداد مهني بالعربية والإنجليزية، بصيغتي PDF وWord، مع مراعاة قابلية القراءة بواسطة ATS.': {en:'Professional preparation in Arabic and English, in PDF and Word formats, with ATS readability in mind.',fr:'Préparation professionnelle en arabe et en anglais, aux formats PDF et Word, en tenant compte de la lisibilité ATS.',it:'Preparazione professionale in arabo e inglese, in formato PDF e Word, tenendo conto della leggibilità ATS.',de:'Professionelle Erstellung auf Arabisch und Englisch im PDF- und Word-Format unter Berücksichtigung der ATS-Lesbarkeit.'},
    'الخدمات والأسعار': {en:'Services and prices',fr:'Services et tarifs',it:'Servizi e prezzi',de:'Leistungen und Preise'},
    'الدفع المسبق عبر Whish Money فقط. لا ترسل ملفات CV أو مستندات شخصية قبل تأكيد الدفع من إدارة RAFIQ. لا تشارك كلمة مرور Whish أو رمز OTP.': {en:'Prepayment is accepted through Whish Money only. Do not send CV files or personal documents before RAFIQ management confirms payment. Never share your Whish password or OTP.',fr:'Le paiement anticipé se fait uniquement via Whish Money. N’envoyez pas de CV ni de documents personnels avant confirmation du paiement par l’administration RAFIQ. Ne partagez jamais votre mot de passe Whish ni votre code OTP.',it:'Il pagamento anticipato è accettato solo tramite Whish Money. Non inviare CV o documenti personali prima della conferma del pagamento da parte dell’amministrazione RAFIQ. Non condividere mai la password Whish o il codice OTP.',de:'Vorauszahlung ist ausschließlich über Whish Money möglich. Senden Sie keine Lebensläufe oder persönlichen Dokumente, bevor die RAFIQ-Verwaltung die Zahlung bestätigt hat. Geben Sie niemals Ihr Whish-Passwort oder OTP weiter.'},
    'يبدأ إعداد الملف بعد مراجعة الإدارة لتأكيد الدفع والاتفاق على الخدمة المطلوبة.': {en:'Document preparation begins after management reviews and confirms payment and the requested service.',fr:'La préparation du document commence après vérification et confirmation du paiement par l’administration et accord sur le service demandé.',it:'La preparazione del documento inizia dopo la verifica e la conferma del pagamento da parte dell’amministrazione e l’accordo sul servizio richiesto.',de:'Die Dokumentenerstellung beginnt, nachdem die Verwaltung die Zahlung geprüft und bestätigt und die gewünschte Leistung vereinbart hat.'},
    'التواصل مع إدارة RAFIQ لخدمة CV': {en:'Contact RAFIQ management for CV services',fr:'Contacter l’administration RAFIQ pour le service CV',it:'Contatta l’amministrazione RAFIQ per il servizio CV',de:'RAFIQ-Verwaltung zum Lebenslaufservice kontaktieren'},
    'دليل الخدمات': {en:'Service directory',fr:'Annuaire des services',it:'Elenco dei servizi',de:'Dienstleistungsverzeichnis'},
    'الدليل والخدمات': {en:'Directory and services',fr:'Annuaire et services',it:'Elenco e servizi',de:'Verzeichnis und Dienste'},
    'فئات الدليل': {en:'Directory categories',fr:'Catégories de l’annuaire',it:'Categorie dell’elenco',de:'Verzeichniskategorien'},
    'دليل استخدام RAFIQ لتصفح المراكز الطبية والعروض المعتمدة في لبنان.': {en:'A guide to using RAFIQ to browse approved medical centres and offers in Lebanon.',fr:'Guide d’utilisation de RAFIQ pour consulter les centres médicaux et offres agréés au Liban.',it:'Guida all’uso di RAFIQ per consultare centri medici e offerte approvati in Libano.',de:'Anleitung zur Nutzung von RAFIQ für die Suche nach zugelassenen medizinischen Zentren und Angeboten im Libanon.'}

    'دليل المراكز والخدمات الطبية | RAFIQ': {en:'Medical centres and services directory | RAFIQ',fr:'Annuaire des centres et services médicaux | RAFIQ',it:'Elenco dei centri e servizi medici | RAFIQ',de:'Verzeichnis medizinischer Zentren und Dienste | RAFIQ'},
    'مناطق لبنان | RAFIQ': {en:'Areas of Lebanon | RAFIQ',fr:'Régions du Liban | RAFIQ',it:'Regioni del Libano | RAFIQ',de:'Regionen des Libanon | RAFIQ'},
    'المختبرات الطبية | RAFIQ': {en:'Medical laboratories | RAFIQ',fr:'Laboratoires médicaux | RAFIQ',it:'Laboratori medici | RAFIQ',de:'Medizinische Labore | RAFIQ'},
    'الأشعة والتصوير الطبي | RAFIQ': {en:'Radiology and medical imaging | RAFIQ',fr:'Radiologie et imagerie médicale | RAFIQ',it:'Radiologia e diagnostica per immagini | RAFIQ',de:'Radiologie und medizinische Bildgebung | RAFIQ'},
    'مراكز العلاج الفيزيائي | RAFIQ': {en:'Physiotherapy centres | RAFIQ',fr:'Centres de physiothérapie | RAFIQ',it:'Centri di fisioterapia | RAFIQ',de:'Physiotherapiezentren | RAFIQ'},
    'المعدات الطبية | RAFIQ': {en:'Medical equipment | RAFIQ',fr:'Équipements médicaux | RAFIQ',it:'Attrezzature mediche | RAFIQ',de:'Medizinische Geräte | RAFIQ'},
    'الأسئلة الشائعة | RAFIQ': {en:'Frequently asked questions | RAFIQ',fr:'Questions fréquentes | RAFIQ',it:'Domande frequenti | RAFIQ',de:'Häufige Fragen | RAFIQ'},
    'دليل استخدام RAFIQ | رفيق': {en:'How to use RAFIQ | Rafiq',fr:'Comment utiliser RAFIQ | Rafiq',it:'Come usare RAFIQ | Rafiq',de:'So verwenden Sie RAFIQ | Rafiq'}

  };

  function normalizeSource(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
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

  function translateSource(text, lang) {
    var normalized = normalizeSource(text);
    if (!normalized) return null;
    var direct = extraTranslations[normalized];
    if (direct && direct[lang || current]) return direct[lang || current];
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
      if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
      var raw = originalTextNodes.get(node);
      if (lang === DEFAULT) {
        if (node.nodeValue !== raw) { node.nodeValue = raw; changed++; }
        continue;
      }
      var translated = lang === DEFAULT ? raw : (translateSource(raw, lang) || raw);
      if (translated) {
        var leading = raw.match(/^\s*/)?.[0] || '';
        var trailing = raw.match(/\s*$/)?.[0] || '';
        var next = leading + translated + trailing;
        if (node.nodeValue !== next) { node.nodeValue = next; changed++; }
      }
    }
    return changed;
  }

  function translateAttributes(lang) {
    var changed = 0;
    var attrs = ['title','alt','aria-label','content'];
    var els = document.querySelectorAll('[title],[alt],[aria-label],meta[name="description"],meta[property^="og:"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.ra-lang,script,style,template')) continue;
      for (var j = 0; j < attrs.length; j++) {
        var name = attrs[j];
        if (!el.hasAttribute(name)) continue;
        var saved = originalAttributes.get(el) || {};
        if (!Object.prototype.hasOwnProperty.call(saved, name)) {
          saved[name] = el.getAttribute(name);
          originalAttributes.set(el, saved);
        }
        var raw = saved[name];
        var val = lang === DEFAULT ? raw : (translateSource(raw, lang) || raw);
        if (val !== null && val !== el.getAttribute(name)) {
          el.setAttribute(name, val);
          changed++;
        }
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
    if (!originalDocumentTitle) originalDocumentTitle = document.title;
    var t = titleKey ? translate(titleKey, code) : translateSource(originalDocumentTitle, code);
    if (t) document.title = t;

    // fill every marked string; anything without a translation keeps
    // whatever the page already had, which is the Arabic original
    var marked = document.querySelectorAll('[data-i18n]');
    var filled = 0, missing = 0;
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var key = el.getAttribute('data-i18n');
      var val = translate(key, code);
      if (val !== null && val !== '') { el.textContent = val; filled++; }
      else { missing++; }
    }

    // Translate legacy pages that predate data-i18n markers.
    var legacyFilled = translateLegacyPage(code);
    var attributeFilled = translateAttributes(code);
    filled += legacyFilled + attributeFilled;

    // placeholder attributes, so inputs are never in the wrong language
    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      var p = translate(ph[j].getAttribute('data-i18n-placeholder'), code);
      if (p) ph[j].setAttribute('placeholder', p);
    }

    // aria-labels
    var al = document.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < al.length; k++) {
      var a = translate(al[k].getAttribute('data-i18n-aria'), code);
      if (a) al[k].setAttribute('aria-label', a);
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
    version: '3'
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