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
if (typeof globalThis.RAFIQ_VERSION === 'undefined') globalThis.RAFIQ_VERSION = '73';

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
  var startPromise = null;
  var pendingBundles = Object.create(null);
  var switchSequence = 0;
  var originalDocumentTitle = document.title || '';
  var originalTextNodes = new WeakMap();
  var originalAttributes = new WeakMap();
  var originalMarkedText = new WeakMap();

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
    if (pendingBundles[code]) return pendingBundles[code];
    var request = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/js/locales/' + code + '.js?v=' + RAFIQ_VERSION;
      script.async = true;
      script.onload = function () { resolve(bundles[code] || null); };
      script.onerror = function () { resolve(null); };
      document.head.appendChild(script);
    });
    pendingBundles[code] = request.then(function (result) {
      delete pendingBundles[code];
      return result;
    });
    return pendingBundles[code];
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

  var inlineTextTranslations = Object.create(null);
  [["القائمة","Menu","Menu","Menu","Menü"],["شريط RAFIQ الرئيسي","RAFIQ main navigation","Navigation principale de RAFIQ","Navigazione principale RAFIQ","RAFIQ-Hauptnavigation"],["العودة إلى الصفحة الأولى","Back to home","Retour à l’accueil","Torna alla pagina iniziale","Zur Startseite"],["الخدمات","Services","Services","Servizi","Dienstleistungen"],["طلب رعاية أو انتساب","Request care or join","Demander une prise en charge ou adhérer","Richiedere assistenza o iscriversi","Betreuung anfragen oder Mitglied werden"],["التقديم والانتساب","Applications and membership","Candidatures et adhésion","Candidature e iscrizione","Bewerbung und Mitgliedschaft"],["الممرضون والممرضات","Nurses","Infirmiers et infirmières","Infermieri e infermiere","Pflegefachkräfte"],["مقدمو الرعاية","Caregivers","Auxiliaires de vie","Assistenti alla cura","Betreuungskräfte"],["المعالجون الفيزيائيون","Physiotherapists","Kinésithérapeutes","Fisioterapisti","Physiotherapeuten"],["الإعلانات والمنشآت الصحية","Healthcare listings and facilities","Annonces et établissements de santé","Annunci e strutture sanitarie","Anzeigen und Gesundheitseinrichtungen"],["الأطباء","Doctors","Médecins","Medici","Ärzte"],["طلب رعاية للأهل","Request care for a family member","Demander une prise en charge pour un proche","Richiedere assistenza per un familiare","Betreuung für Angehörige anfragen"],["المنتسبون والتقديمات","Members and benefits","Membres et avantages","Iscritti e vantaggi","Mitglieder und Leistungen"],["دليل الرعاية","Care guide","Guide des soins","Guida all’assistenza","Pflegeleitfaden"],["الأسئلة الشائعة","Frequently asked questions","Questions fréquentes","Domande frequenti","Häufig gestellte Fragen"],["المناطق","Areas","Zones","Zone","Gebiete"],["مساعد رفيق","RAFIQ assistant","Assistant RAFIQ","Assistente RAFIQ","RAFIQ-Assistent"],["الممرضون والممرضات | RAFIQ","Nurses | RAFIQ","Infirmiers et infirmières | RAFIQ","Infermieri e infermiere | RAFIQ","Pflegefachkräfte | RAFIQ"],["مقدمو الرعاية | RAFIQ","Caregivers | RAFIQ","Auxiliaires de vie | RAFIQ","Assistenti alla cura | RAFIQ","Betreuungskräfte | RAFIQ"],["الإعلانات والشراكات | RAFIQ","Listings and partnerships | RAFIQ","Annonces et partenariats | RAFIQ","Annunci e partnership | RAFIQ","Anzeigen und Partnerschaften | RAFIQ"],["الأطباء والاختصاصات الطبية | RAFIQ","Doctors and medical specialties | RAFIQ","Médecins et spécialités médicales | RAFIQ","Medici e specialità mediche | RAFIQ","Ärzte und medizinische Fachgebiete | RAFIQ"],["طلب رعاية لأحد أفراد العائلة | RAFIQ","Request care for a family member | RAFIQ","Demander des soins pour un membre de la famille | RAFIQ","Richiedi assistenza per un familiare | RAFIQ","Betreuung für ein Familienmitglied anfragen | RAFIQ"],["الانتساب والاستفادة من تقديمات RAFIQ","RAFIQ membership and benefits","Adhésion et avantages RAFIQ","Iscrizione e vantaggi RAFIQ","RAFIQ-Mitgliedschaft und Vorteile"],["المعالجون الفيزيائيون | RAFIQ","Physiotherapists | RAFIQ","Kinésithérapeutes | RAFIQ","Fisioterapisti | RAFIQ","Physiotherapeuten | RAFIQ"],["قدّم ملفك المهني للانضمام إلى شبكة التمريض والرعاية المنزلية في لبنان.","Submit your professional profile to join Lebanon’s nursing and home-care network.","Soumettez votre profil professionnel pour rejoindre le réseau libanais de soins infirmiers et à domicile.","Invia il tuo profilo professionale per entrare nella rete libanese di assistenza infermieristica e domiciliare.","Reichen Sie Ihr berufliches Profil ein, um dem Netzwerk für Pflege und häusliche Betreuung im Libanon beizutreten."],["مقدمو ومقدمات الرعاية","Caregivers","Auxiliaires de vie","Assistenti alla cura","Betreuungskräfte"],["سجّل خبرتك ورغبتك في تقديم الرعاية المنزلية للعائلات في لبنان.","Register your experience and your interest in providing home care to families in Lebanon.","Enregistrez votre expérience et votre intérêt pour les soins à domicile aux familles au Liban.","Registra la tua esperienza e la disponibilità a fornire assistenza domiciliare alle famiglie in Libano.","Registrieren Sie Ihre Erfahrung und Ihr Interesse an häuslicher Betreuung für Familien im Libanon."],["المعالجون والمعالجات الفيزيائيون","Physiotherapists","Kinésithérapeutes","Fisioterapisti","Physiotherapeuten"],["قدّم ملفك المهني لتقديم خدمات العلاج الفيزيائي المنزلي أو في العيادة ضمن شبكة RAFIQ.","Submit your professional profile to provide home or clinic-based physiotherapy through the RAFIQ network.","Soumettez votre profil professionnel pour proposer des séances de kinésithérapie à domicile ou en cabinet au sein du réseau RAFIQ.","Invia il tuo profilo professionale per offrire fisioterapia a domicilio o in ambulatorio nella rete RAFIQ.","Reichen Sie Ihr berufliches Profil ein, um Physiotherapie zu Hause oder in einer Praxis im RAFIQ-Netzwerk anzubieten."],["أعلن معنا في RAFIQ","Advertise with RAFIQ","Annoncez avec RAFIQ","Fai pubblicità con RAFIQ","Werben Sie mit RAFIQ"],["مساحة تعريفية للمختبرات ومراكز الأشعة ومراكز بيع وتأجير المعدات الطبية في لبنان.","A listing space for laboratories, imaging centers, and medical equipment sales and rental centers in Lebanon.","Un espace de présentation pour les laboratoires, centres d’imagerie et centres de vente et de location de matériel médical au Liban.","Uno spazio informativo per laboratori, centri di diagnostica per immagini e centri di vendita e noleggio di attrezzature mediche in Libano.","Eine Präsentationsfläche für Labore, Bildgebungszentren sowie Verkaufs- und Vermietungsstellen für medizinische Geräte im Libanon."],["إرسال الطلب لا يعني نشر الإعلان. تُراجع إدارة RAFIQ بيانات المنشأة والمحتوى والمدة، ولا يظهر أي إعلان إلا بعد الموافقة الصريحة.","Submitting a request does not publish an advertisement. RAFIQ management reviews the facility details, content, and duration. Listings appear only after explicit approval.","L’envoi d’une demande ne signifie pas la publication de l’annonce. L’équipe RAFIQ vérifie les informations, le contenu et la durée. Toute annonce nécessite une approbation explicite.","L’invio della richiesta non comporta la pubblicazione dell’annuncio. La direzione RAFIQ verifica i dati della struttura, il contenuto e la durata. Gli annunci vengono pubblicati solo dopo approvazione esplicita.","Das Absenden einer Anfrage bedeutet nicht, dass eine Anzeige veröffentlicht wird. Die RAFIQ-Leitung prüft Angaben, Inhalt und Laufzeit. Anzeigen erscheinen nur nach ausdrücklicher Freigabe."],["الأطباء من جميع الاختصاصات","Doctors across all specialties","Médecins de toutes spécialités","Medici di tutte le specialità","Ärzte aller Fachrichtungen"],["انضم إلى شبكة RAFIQ لتسهيل وصول العائلات إلى الأطباء والخدمات الصحية بعد مراجعة الملف واعتماده.","Join the RAFIQ network to help families access doctors and health services after profile review and approval.","Rejoignez le réseau RAFIQ afin de faciliter l’accès des familles aux médecins et aux services de santé, après examen et validation du dossier.","Entra nella rete RAFIQ per facilitare l’accesso delle famiglie a medici e servizi sanitari, previa verifica e approvazione del profilo.","Werden Sie Teil des RAFIQ-Netzwerks, damit Familien nach Prüfung und Freigabe des Profils leichter Zugang zu Ärzten und Gesundheitsleistungen erhalten."],["اطلب الرعاية لأهلك","Request care for your family","Demandez des soins pour vos proches","Richiedi assistenza per la tua famiglia","Betreuung für Ihre Angehörigen anfragen"],["أرسل معلومات أولية مختصرة وسيراجع فريق RAFIQ الطلب للتواصل معك.","Send brief initial information. The RAFIQ team will review your request and contact you.","Envoyez quelques informations initiales. L’équipe RAFIQ examinera votre demande et vous contactera.","Invia alcune informazioni iniziali. Il team RAFIQ esaminerà la richiesta e ti contatterà.","Senden Sie einige erste Angaben. Das RAFIQ-Team prüft Ihre Anfrage und kontaktiert Sie."],["لا ترسل تقارير طبية أو معلومات حساسة غير ضرورية. اكتب وصفاً مختصراً للحاجة فقط.","Do not send medical reports or unnecessary sensitive information. Provide only a brief description of the need.","N’envoyez pas de rapports médicaux ni d’informations sensibles inutiles. Décrivez uniquement brièvement le besoin.","Non inviare referti medici o informazioni sensibili non necessarie. Descrivi soltanto brevemente l’esigenza.","Senden Sie keine medizinischen Berichte oder unnötigen sensiblen Angaben. Beschreiben Sie nur kurz den Bedarf."],["شروط التقديم","Application requirements","Conditions de candidature","Requisiti per la candidatura","Bewerbungsvoraussetzungen"],["يشترط إدخال بيانات صحيحة وإرفاق السيرة الذاتية والشهادة وصورة الترخيص المهني. تخضع الملفات لمراجعة الإدارة والتحقق قبل أي اعتماد أو تواصل بشأن العمل.","Please provide accurate information and attach your CV, qualification certificate, and professional licence. Profiles are reviewed and verified before approval or any work-related contact.","Veuillez fournir des informations exactes et joindre votre CV, votre diplôme et une copie de votre autorisation professionnelle. Les dossiers sont examinés et vérifiés avant toute validation ou prise de contact professionnelle.","Inserisci dati corretti e allega il CV, il certificato di qualifica e una copia della licenza professionale. I profili vengono verificati prima dell’approvazione o di qualsiasi contatto lavorativo.","Bitte geben Sie korrekte Daten ein und fügen Sie Lebenslauf, Qualifikationsnachweis und Berufszulassung bei. Profile werden vor einer Freigabe oder Kontaktaufnahme geprüft."],["يرجى إدخال رقم الترخيص والاختصاص والمناطق التي تغطيها، وإرفاق السيرة الذاتية والشهادة المهنية. لا يُعتمد أي ملف قبل مراجعته.","Please enter your licence number, specialty, and service areas, and attach your CV and professional certificate. No profile is approved before review.","Veuillez indiquer votre numéro d’autorisation, votre spécialité et vos zones d’intervention, puis joindre votre CV et votre diplôme professionnel. Aucun dossier n’est validé sans examen.","Inserisci il numero di licenza, la specializzazione e le aree servite; allega il CV e il certificato professionale. Nessun profilo viene approvato senza verifica.","Bitte geben Sie Zulassungsnummer, Fachgebiet und Einsatzgebiete an und fügen Sie Lebenslauf und Berufsnachweis bei. Kein Profil wird ohne Prüfung freigegeben."],["نرحب بمن لديهم خبرة في رعاية كبار السن أو المرضى أو ذوي الاحتياجات الخاصة. لا يُطلب أي رسم للتقديم. تخضع الطلبات للمراجعة ولا يعني التسجيل ضمان وظيفة.","We welcome applicants experienced in caring for older adults, patients, or people with disabilities. Applying is free. Applications are reviewed, and registration does not guarantee employment.","Les personnes ayant de l’expérience auprès des personnes âgées, des patients ou des personnes en situation de handicap sont les bienvenues. La candidature est gratuite. Les demandes sont examinées et l’inscription ne garantit pas un emploi.","Accogliamo candidati con esperienza nell’assistenza ad anziani, pazienti o persone con disabilità. La candidatura è gratuita. Le richieste vengono esaminate e l’iscrizione non garantisce un impiego.","Bewerber mit Erfahrung in der Betreuung älterer Menschen, Patienten oder Menschen mit Behinderungen sind willkommen. Die Bewerbung ist kostenlos. Alle Anfragen werden geprüft; eine Registrierung garantiert keine Beschäftigung."],["الاسم الأول","First name","Prénom","Nome","Vorname"],["اسم العائلة","Last name","Nom de famille","Cognome","Nachname"],["اسم صاحب الطلب","Applicant name","Nom du demandeur","Nome del richiedente","Name der anfragenden Person"],["رقم الهاتف","Phone number","Numéro de téléphone","Numero di telefono","Telefonnummer"],["المدينة / المنطقة","City / area","Ville / zone","Città / zona","Stadt / Gebiet"],["المدينة / المناطق","City / areas","Ville / zones","Città / zone","Stadt / Gebiete"],["المناطق المتاحة","Available areas","Zones disponibles","Zone disponibili","Verfügbare Einsatzgebiete"],["الشهادة العلمية","Academic qualification","Diplôme / qualification","Titolo di studio","Schul- oder Hochschulabschluss"],["رقم الترخيص","Licence number","Numéro d’autorisation","Numero di licenza","Zulassungsnummer"],["رقم الترخيص المهني","Professional licence number","Numéro d’autorisation professionnelle","Numero di licenza professionale","Berufszulassungsnummer"],["سنوات الخبرة","Years of experience","Années d’expérience","Anni di esperienza","Jahre Berufserfahrung"],["التخصص","Specialty","Spécialité","Specializzazione","Fachgebiet"],["اختر","Select","Choisir","Seleziona","Auswählen"],["تمريض عام","General nursing","Soins infirmiers généraux","Infermieristica generale","Allgemeine Krankenpflege"],["تمريض منزلي","Home nursing","Soins infirmiers à domicile","Assistenza infermieristica domiciliare","Häusliche Krankenpflege"],["عناية فائقة","Intensive care","Soins intensifs","Terapia intensiva","Intensivpflege"],["تمريض أطفال","Pediatric nursing","Soins infirmiers pédiatriques","Infermieristica pediatrica","Kinderkrankenpflege"],["رعاية كبار السن","Elderly care","Soins aux personnes âgées","Assistenza agli anziani","Betreuung älterer Menschen"],["اختصاص آخر","Other specialty","Autre spécialité","Altra specializzazione","Anderes Fachgebiet"],["ساعات التوفر","Available hours","Horaires de disponibilité","Orari di disponibilità","Verfügbare Zeiten"],["الخبرة العملية","Work experience","Expérience professionnelle","Esperienza lavorativa","Berufserfahrung"],["السيرة الذاتية CV","CV / résumé","CV / curriculum vitae","CV / curriculum","Lebenslauf"],["صورة الشهادة","Certificate image","Copie du diplôme","Immagine del certificato","Abbildung des Zertifikats"],["صورة الترخيص","Licence image","Copie de l’autorisation","Immagine della licenza","Abbildung der Zulassung"],["أوافق على مراجعة بياناتي المهنية لأغراض الانتساب إلى RAFIQ.","I agree to the review of my professional information for RAFIQ membership.","J’accepte l’examen de mes informations professionnelles dans le cadre de mon adhésion à RAFIQ.","Acconsento alla verifica dei miei dati professionali ai fini dell’iscrizione a RAFIQ.","Ich stimme der Prüfung meiner beruflichen Angaben im Rahmen meiner Aufnahme bei RAFIQ zu."],["أوافق على استخدام بياناتي لمراجعة طلب الانتساب والتواصل بشأن فرص مناسبة.","I agree to the use of my information to review my application and contact me about suitable opportunities.","J’accepte l’utilisation de mes informations pour examiner ma candidature et me contacter au sujet d’opportunités adaptées.","Acconsento all’utilizzo dei miei dati per valutare la candidatura e contattarmi in merito a opportunità adeguate.","Ich stimme der Nutzung meiner Angaben zur Prüfung meiner Bewerbung und zur Kontaktaufnahme wegen geeigneter Möglichkeiten zu."],["أوافق على مراجعة بياناتي المهنية لأغراض الانتساب إلى RAFIQ.","I agree to the review of my professional information for RAFIQ membership.","J’accepte l’examen de mes informations professionnelles dans le cadre de mon adhésion à RAFIQ.","Acconsento alla verifica dei miei dati professionali ai fini dell’iscrizione a RAFIQ.","Ich stimme der Prüfung meiner beruflichen Angaben im Rahmen meiner Aufnahme bei RAFIQ zu."],["قدّم الآن","Submit now","Envoyer la candidature","Invia ora","Jetzt bewerben"],["قدّم ملفك","Submit your profile","Soumettre votre dossier","Invia il profilo","Profil einreichen"],["قدّم ملفك المهني","Submit your professional profile","Soumettre votre profil professionnel","Invia il profilo professionale","Berufliches Profil einreichen"],["RAFIQ | رفيق — لا يوجد أي رسم للتقديم.","RAFIQ | Rafiq — Applying is free.","RAFIQ | Rafiq — La candidature est gratuite.","RAFIQ | Rafiq — La candidatura è gratuita.","RAFIQ | Rafiq — Die Bewerbung ist kostenlos."],["RAFIQ | رفيق — لا تُنشر الإعلانات قبل اعتماد الإدارة.","RAFIQ | Rafiq — Listings are not published before management approval.","RAFIQ | Rafiq — Les annonces ne sont pas publiées avant validation de la direction.","RAFIQ | Rafiq — Gli annunci non vengono pubblicati prima dell’approvazione della direzione.","RAFIQ | Rafiq — Anzeigen werden erst nach Freigabe durch die Leitung veröffentlicht."],["RAFIQ | رفيق — جميع الطلبات تخضع لمراجعة الإدارة.","RAFIQ | Rafiq — All applications are reviewed by management.","RAFIQ | Rafiq — Toutes les candidatures sont examinées par la direction.","RAFIQ | Rafiq — Tutte le candidature sono esaminate dalla direzione.","RAFIQ | Rafiq — Alle Bewerbungen werden von der Leitung geprüft."],["RAFIQ | رفيق — استلام الطلب لا يعني تأكيد توفر الخدمة.","RAFIQ | Rafiq — Receipt of a request does not confirm service availability.","RAFIQ | Rafiq — La réception d’une demande ne confirme pas la disponibilité du service.","RAFIQ | Rafiq — La ricezione della richiesta non conferma la disponibilità del servizio.","RAFIQ | Rafiq — Der Eingang einer Anfrage bestätigt nicht die Verfügbarkeit der Leistung."],["مساحة تعريفية للمختبرات ومراكز الأشعة ومراكز بيع وتأجير المعدات الطبية في لبنان.","A listing space for laboratories, imaging centers, and medical equipment sales and rental centers in Lebanon.","Un espace de présentation pour les laboratoires, centres d’imagerie et centres de vente et de location de matériel médical au Liban.","Uno spazio informativo per laboratori, centri di diagnostica per immagini e centri di vendita e noleggio di attrezzature mediche in Libano.","Eine Präsentationsfläche für Labore, Bildgebungszentren sowie Verkaufs- und Vermietungsstellen für medizinische Geräte im Libanon."],["نوع المنشأة","Facility type","Type d’établissement","Tipo di struttura","Art der Einrichtung"],["اختر النوع","Choose a type","Choisir un type","Scegli il tipo","Typ auswählen"],["مختبر طبي","Medical laboratory","Laboratoire médical","Laboratorio medico","Medizinisches Labor"],["مركز أشعة وتصوير","Radiology and imaging center","Centre de radiologie et d’imagerie","Centro di radiologia e diagnostica per immagini","Radiologie- und Bildgebungszentrum"],["مركز بيع أو تأجير معدات طبية","Medical equipment sales or rental center","Centre de vente ou de location de matériel médical","Centro di vendita o noleggio di attrezzature mediche","Verkaufs- oder Vermietungsstelle für medizinische Geräte"],["اسم المنشأة","Facility name","Nom de l’établissement","Nome della struttura","Name der Einrichtung"],["اسم المسؤول","Contact person","Nom du responsable","Nome del referente","Name der verantwortlichen Person"],["البريد الإلكتروني","Email address","Adresse e-mail","Indirizzo e-mail","E-Mail-Adresse"],["رقم الترخيص / السجل","Licence / registration number","Numéro d’autorisation / d’enregistrement","Numero di licenza / registrazione","Zulassungs- / Registrierungsnummer"],["المحافظة","Governorate","Gouvernorat","Governatorato","Gouvernement"],["القضاء","District","District","Distretto","Bezirk"],["المنطقة","Area","Zone","Zona","Gebiet"],["مدة الإعلان المقترحة","Proposed listing duration","Durée de l’annonce proposée","Durata proposta dell’annuncio","Vorgeschlagene Anzeigendauer"],["أسبوع","One week","Une semaine","Una settimana","Eine Woche"],["شهر","One month","Un mois","Un mese","Ein Monat"],["3 أشهر","3 months","3 mois","3 mesi","3 Monate"],["6 أشهر","6 months","6 mois","6 mesi","6 Monate"],["مدة أخرى / للمناقشة","Other duration / to be discussed","Autre durée / à discuter","Altra durata / da concordare","Andere Laufzeit / nach Absprache"],["العنوان الكامل","Full address","Adresse complète","Indirizzo completo","Vollständige Adresse"],["الخدمات والأسعار","Services and prices","Services et tarifs","Servizi e prezzi","Dienstleistungen und Preise"],["ملاحظات أو تفاصيل الإعلان","Notes or listing details","Notes ou détails de l’annonce","Note o dettagli dell’annuncio","Hinweise oder Anzeigendetails"],["شعار المنشأة (PDF أو صورة)","Facility logo (PDF or image)","Logo de l’établissement (PDF ou image)","Logo della struttura (PDF o immagine)","Logo der Einrichtung (PDF oder Bild)"],["صور المنشأة والخدمات","Facility and service photos","Photos de l’établissement et des services","Foto della struttura e dei servizi","Fotos der Einrichtung und Dienstleistungen"],["مستند الترخيص / التسجيل","Licence / registration document","Document d’autorisation / d’enregistrement","Documento di licenza / registrazione","Zulassungs- / Registrierungsdokument"],["أقر بصحة بيانات المنشأة وأوافق على مراجعة الطلب من إدارة RAFIQ.","I confirm that the facility information is accurate and agree to review by RAFIQ management.","Je confirme l’exactitude des informations de l’établissement et accepte l’examen de la demande par la direction de RAFIQ.","Confermo che i dati della struttura sono corretti e acconsento alla verifica da parte della direzione RAFIQ.","Ich bestätige die Richtigkeit der Einrichtungsdaten und stimme der Prüfung durch die RAFIQ-Leitung zu."],["أعلن معنا","Advertise with us","Publier une annonce avec nous","Pubblica con noi","Mit uns werben"],["الأطباء من جميع الاختصاصات","Doctors across all specialties","Médecins de toutes spécialités","Medici di tutte le specialità","Ärzte aller Fachrichtungen"],["انضم إلى شبكة RAFIQ لتسهيل وصول العائلات إلى الأطباء والخدمات الصحية بعد مراجعة الملف واعتماده.","Join the RAFIQ network to help families access doctors and health services after profile review and approval.","Rejoignez le réseau RAFIQ afin de faciliter l’accès des familles aux médecins et aux services de santé, après examen et validation du dossier.","Entra nella rete RAFIQ per facilitare l’accesso delle famiglie a medici e servizi sanitari, previa verifica e approvazione del profilo.","Werden Sie Teil des RAFIQ-Netzwerks, damit Familien nach Prüfung und Freigabe des Profils leichter Zugang zu Ärzten und Gesundheitsleistungen erhalten."],["الاختصاص الطبي","Medical specialty","Spécialité médicale","Specializzazione medica","Medizinisches Fachgebiet"],["اختر الاختصاص","Choose a specialty","Choisir une spécialité","Scegli una specializzazione","Fachgebiet auswählen"],["طب عام","General medicine","Médecine générale","Medicina generale","Allgemeinmedizin"],["طب الأسرة","Family medicine","Médecine de famille","Medicina di famiglia","Familienmedizin"],["طب الأطفال","Pediatrics","Pédiatrie","Pediatria","Kinderheilkunde"],["القلب","Cardiology","Cardiologie","Cardiologia","Kardiologie"],["الأعصاب","Neurology","Neurologie","Neurologia","Neurologie"],["العظام","Orthopedics","Orthopédie","Ortopedia","Orthopädie"],["الجراحة","Surgery","Chirurgie","Chirurgia","Chirurgie"],["النسائية والتوليد","Obstetrics and gynecology","Gynécologie et obstétrique","Ginecologia e ostetricia","Gynäkologie und Geburtshilfe"],["الجلدية","Dermatology","Dermatologie","Dermatologia","Dermatologie"],["العيون","Ophthalmology","Ophtalmologie","Oftalmologia","Augenheilkunde"],["الأنف والأذن والحنجرة","Ear, nose and throat","Oto-rhino-laryngologie","Otorinolaringoiatria","Hals-Nasen-Ohren-Heilkunde"],["الطب النفسي","Psychiatry","Psychiatrie","Psichiatria","Psychiatrie"],["الأورام","Oncology","Oncologie","Oncologia","Onkologie"],["التخدير","Anesthesiology","Anesthésiologie","Anestesiologia","Anästhesiologie"],["الأشعة","Radiology","Radiologie","Radiologia","Radiologie"],["رقم الترخيص المهني","Professional licence number","Numéro d’autorisation professionnelle","Numero di licenza professionale","Berufszulassungsnummer"],["مكان العمل","Workplace","Lieu de travail","Luogo di lavoro","Arbeitsort"],["المنطقة / المدينة","Area / city","Zone / ville","Zona / città","Gebiet / Stadt"],["المواعيد المتاحة","Available hours","Horaires disponibles","Orari disponibili","Verfügbare Termine"],["نوع تقديم الخدمة","Service delivery method","Mode de prestation","Modalità di erogazione","Art der Leistungserbringung"],["في العيادة","At the clinic","Au cabinet","In ambulatorio","In der Praxis"],["زيارة منزلية","Home visit","Visite à domicile","Visita a domicilio","Hausbesuch"],["كلاهما","Both","Les deux","Entrambi","Beides"],["نبذة عن الخبرة والخدمات","Brief summary of experience and services","Résumé de l’expérience et des services","Breve descrizione dell’esperienza e dei servizi","Kurzbeschreibung von Erfahrung und Leistungen"],["الشهادة / إثبات الاختصاص","Certificate / proof of specialty","Diplôme / preuve de spécialité","Certificato / prova della specializzazione","Zertifikat / Fachgebietsnachweis"],["أوافق على استخدام بياناتي المهنية لمراجعة طلب الانضمام إلى RAFIQ.","I agree to the use of my professional information to review my RAFIQ membership application.","J’accepte l’utilisation de mes informations professionnelles pour examiner ma demande d’adhésion à RAFIQ.","Acconsento all’utilizzo dei miei dati professionali per valutare la richiesta di adesione a RAFIQ.","Ich stimme der Verwendung meiner beruflichen Angaben zur Prüfung meines RAFIQ-Mitgliedsantrags zu."],["قدّم ملفك","Submit your profile","Soumettre votre profil","Invia il profilo","Profil einreichen"],["إرسال طلب الرعاية","Send care request","Envoyer une demande de soins","Invia una richiesta di assistenza","Betreuungsanfrage senden"],["أرسل معلومات أولية مختصرة وسيراجع فريق RAFIQ الطلب للتواصل معك.","Send brief initial information. The RAFIQ team will review your request and contact you.","Envoyez quelques informations initiales. L’équipe RAFIQ examinera votre demande et vous contactera.","Invia alcune informazioni iniziali. Il team RAFIQ esaminerà la richiesta e ti contatterà.","Senden Sie einige erste Angaben. Das RAFIQ-Team prüft Ihre Anfrage und kontaktiert Sie."],["اسم الشخص المحتاج للرعاية","Name of the person needing care","Nom de la personne ayant besoin de soins","Nome della persona che necessita assistenza","Name der betreuungsbedürftigen Person"],["نوع الرعاية المطلوبة","Type of care needed","Type de soins requis","Tipo di assistenza richiesta","Benötigte Betreuungsart"],["رعاية مريض","Patient care","Soins aux patients","Assistenza ai pazienti","Patientenbetreuung"],["رعاية ذوي الاحتياجات الخاصة","Care for people with disabilities","Soins aux personnes en situation de handicap","Assistenza a persone con disabilità","Betreuung von Menschen mit Behinderungen"],["استشارة لتحديد الخدمة","Guidance to identify the right service","Conseil pour déterminer le service adapté","Consulenza per individuare il servizio adatto","Beratung zur Auswahl der passenden Leistung"],["عمر الشخص المحتاج للرعاية","Age of the person needing care","Âge de la personne ayant besoin de soins","Età della persona che necessita assistenza","Alter der betreuungsbedürftigen Person"],["المدة المطلوبة","Required duration","Durée souhaitée","Durata richiesta","Gewünschte Dauer"],["مؤقتة","Temporary","Temporaire","Temporanea","Vorübergehend"],["طويلة الأمد","Long term","Longue durée","A lungo termine","Langfristig"],["غير محددة بعد","Not decided yet","Pas encore définie","Non ancora definita","Noch nicht festgelegt"],["الحالة باختصار","Brief description of the situation","Brève description de la situation","Breve descrizione della situazione","Kurze Beschreibung der Situation"],["ملاحظات إضافية","Additional notes","Remarques complémentaires","Note aggiuntive","Zusätzliche Hinweise"],["أوافق على استخدام بيانات التواصل ومعلومات الطلب لمراجعته والرد عليّ.","I agree to the use of my contact details and request information for review and response.","J’accepte l’utilisation de mes coordonnées et des informations de ma demande pour son examen et pour me répondre.","Acconsento all’utilizzo dei miei recapiti e delle informazioni della richiesta per la valutazione e la risposta.","Ich stimme der Nutzung meiner Kontaktdaten und Anfrageinformationen zur Prüfung und Beantwortung zu."],["ما الذي يقدمه الانتساب؟","What does membership offer?","Quels sont les avantages de l’adhésion ?","Cosa offre l’iscrizione?","Welche Vorteile bietet die Mitgliedschaft?"],["التعرّف إلى الخدمات والتقديمات المتاحة عبر المنصة.","Discover the services and benefits available through the platform.","Découvrir les services et avantages disponibles sur la plateforme.","Scoprire i servizi e i vantaggi disponibili sulla piattaforma.","Die über die Plattform verfügbaren Leistungen und Vorteile kennenlernen."],["الاستفادة من الخصومات التي تعتمدها الجهات المتعاقدة عند توفرها.","Access discounts offered by contracted partners when available.","Bénéficier des réductions proposées par les partenaires conventionnés, lorsqu’elles sont disponibles.","Usufruire degli sconti offerti dai partner convenzionati, quando disponibili.","Von Rabatten vertraglich gebundener Partner profitieren, sofern verfügbar."],["متابعة الإعلانات والتحديثات الرسمية.","Follow official announcements and updates.","Suivre les annonces et mises à jour officielles.","Seguire gli annunci e gli aggiornamenti ufficiali.","Offizielle Mitteilungen und Aktualisierungen verfolgen."],["تختلف التقديمات والخصومات بحسب المنطقة والجهة والاتفاقات المعتمدة. لا توجد خصومات أو مبالغ مضمونة بمجرد التسجيل، ولا تُطلب أي رسوم أو بيانات بطاقات.","Benefits and discounts vary by area, provider, and approved agreements. Registration does not guarantee a discount or payment, and no fees or card details are requested.","Les avantages et réductions varient selon la zone, le prestataire et les accords approuvés. L’inscription ne garantit aucune réduction ni somme, et aucun frais ni renseignement de carte n’est demandé.","Vantaggi e sconti variano in base alla zona, al fornitore e agli accordi approvati. L’iscrizione non garantisce sconti o importi e non vengono richiesti pagamenti né dati di carte.","Leistungen und Rabatte variieren je nach Gebiet, Anbieter und genehmigten Vereinbarungen. Die Registrierung garantiert keine Rabatte oder Zahlungen; Gebühren oder Kartendaten werden nicht verlangt."],["نوع الاستفادة المطلوبة","Type of benefit requested","Type d’avantage souhaité","Tipo di vantaggio richiesto","Gewünschte Leistung"],["خدمات الرعاية الصحية","Healthcare services","Services de soins de santé","Servizi sanitari","Gesundheitsleistungen"],["خصومات الجهات المتعاونة","Partner discounts","Réductions des partenaires","Sconti dei partner","Partnerrabatte"],["تقديمات العائلة","Family benefits","Avantages pour la famille","Vantaggi per la famiglia","Familienleistungen"],["متابعة أخبار المنصة","Follow platform news","Suivre les actualités de la plateforme","Seguire le notizie della piattaforma","Plattform-Neuigkeiten verfolgen"],["ملاحظات (اختياري)","Notes (optional)","Remarques (facultatif)","Note (facoltativo)","Hinweise (optional)"],["أوافق على استخدام بياناتي للتواصل بشأن الانتساب والتقديمات المتاحة.","I agree to be contacted about membership and available benefits.","J’accepte d’être contacté au sujet de l’adhésion et des avantages disponibles.","Acconsento a essere contattato in merito all’iscrizione e ai vantaggi disponibili.","Ich stimme der Kontaktaufnahme zu Mitgliedschaft und verfügbaren Leistungen zu."],["انتسب الآن","Join now","Adhérer maintenant","Iscriviti ora","Jetzt Mitglied werden"],["RAFIQ | رفيق — الانتساب لا يضمن توفر خدمة أو خصم في كل منطقة.","RAFIQ | Rafiq — Membership does not guarantee a service or discount in every area.","RAFIQ | Rafiq — L’adhésion ne garantit pas la disponibilité d’un service ou d’une réduction dans chaque zone.","RAFIQ | Rafiq — L’iscrizione non garantisce un servizio o uno sconto in ogni zona.","RAFIQ | Rafiq — Die Mitgliedschaft garantiert keine Leistung oder Ermäßigung in jedem Gebiet."],["منصة رعاية منزلية وخدمات صحية في لبنان","A home-care and health-services platform in Lebanon","Une plateforme de soins à domicile et de services de santé au Liban","Una piattaforma di assistenza domiciliare e servizi sanitari in Libano","Eine Plattform für häusliche Betreuung und Gesundheitsleistungen im Libanon"],["تنظّم طلبات العائلات، وتربطها بمقدمي الرعاية والممرضين والمعالجين الفيزيائيين، وتبني شبكة خدمات مساندة وفق مراجعة الإدارة والاتفاقات الموثقة.","We organize family requests, connect them with caregivers, nurses, and physiotherapists, and build a supporting service network subject to management review and documented agreements.","Nous organisons les demandes des familles, les mettons en relation avec des auxiliaires de vie, des infirmiers et des kinésithérapeutes, et développons un réseau de services complémentaires soumis à l’examen de la direction et à des accords documentés.","Organizziamo le richieste delle famiglie, le mettiamo in contatto con assistenti, infermieri e fisioterapisti e sviluppiamo una rete di servizi di supporto soggetta alla verifica della direzione e ad accordi documentati.","Wir organisieren Familienanfragen, vermitteln Kontakte zu Betreuungskräften, Pflegefachkräften und Physiotherapeuten und bauen ein ergänzendes Servicenetz auf, das von der Leitung geprüft und durch dokumentierte Vereinbarungen geregelt wird."],["📝 طلب رعاية أو انتساب","📝 Request care or join","📝 Demander des soins ou adhérer","📝 Richiedi assistenza o iscriviti","📝 Betreuung anfragen oder Mitglied werden"],["💬 واتساب RAFIQ","💬 RAFIQ WhatsApp","💬 WhatsApp RAFIQ","💬 WhatsApp RAFIQ","💬 RAFIQ WhatsApp"],["📲 تثبيت تطبيق رفيق","📲 Install RAFIQ app","📲 Installer l’application RAFIQ","📲 Installa l’app RAFIQ","📲 RAFIQ-App installieren"],["استكشف الخدمات","Explore services","Découvrir les services","Esplora i servizi","Dienstleistungen entdecken"],["رفيق مع العائلة ❤️","RAFIQ with your family ❤️","RAFIQ aux côtés de votre famille ❤️","RAFIQ accanto alla famiglia ❤️","RAFIQ an Ihrer Seite ❤️"],["رعاية إنسانية دافئة داخل المنزل، حيث نؤمن أن الأمان والاهتمام والرفقة تبدأ من فهم احتياج كل عائلة.","Warm, compassionate care at home. We believe safety, attention, and companionship begin with understanding each family’s needs.","Des soins humains et chaleureux à domicile : nous pensons que la sécurité, l’attention et la présence commencent par la compréhension des besoins de chaque famille.","Assistenza umana e calorosa a domicilio: crediamo che sicurezza, attenzione e compagnia inizino dalla comprensione delle esigenze di ogni famiglia.","Warme, menschliche Betreuung zu Hause. Sicherheit, Aufmerksamkeit und Begleitung beginnen damit, die Bedürfnisse jeder Familie zu verstehen."],["خدمات RAFIQ باختصار","RAFIQ services at a glance","Les services RAFIQ en bref","I servizi RAFIQ in breve","RAFIQ-Leistungen im Überblick"],["ملخص سريع لكل حالة. الصورة والشرح المفصل موجودان داخل صفحة كل اختصاص.","A quick overview of each service. Photos and full details are available on each specialty page.","Un aperçu rapide de chaque service. Les photos et les détails sont disponibles sur la page de chaque spécialité.","Una breve panoramica di ogni servizio. Foto e dettagli completi sono disponibili nella pagina dedicata a ciascuna specialità.","Ein kurzer Überblick über jede Leistung. Bilder und ausführliche Informationen finden Sie auf den jeweiligen Fachseiten."],["مرافقة ودعم في الحياة اليومية، والمساعدة في الاحتياجات الشخصية والتنقل والرعاية النهارية أو الليلية بحسب الحالة.","Companionship and daily support, including personal needs, mobility, and day or night care according to each situation.","Accompagnement et soutien au quotidien, notamment pour les besoins personnels, la mobilité et les soins de jour ou de nuit selon la situation.","Compagnia e supporto quotidiano, inclusi bisogni personali, mobilità e assistenza diurna o notturna secondo la situazione.","Begleitung und Unterstützung im Alltag, einschließlich persönlicher Bedürfnisse, Mobilität sowie Betreuung tagsüber oder nachts je nach Situation."],["التفاصيل والصورة","Details and photo","Détails et photo","Dettagli e foto","Details und Foto"],["تنظيم طلبات التمريض وربطها بالاختصاص والخبرة والمنطقة، مع مراجعة الطلب قبل المطابقة.","Organizing nursing requests and matching them by specialty, experience, and area after review.","Organisation des demandes de soins infirmiers et mise en relation selon la spécialité, l’expérience et la zone, après examen.","Organizzazione delle richieste infermieristiche e abbinamento in base a specializzazione, esperienza e zona, previa verifica.","Organisation von Pflegeanfragen und Zuordnung nach Fachgebiet, Erfahrung und Gebiet nach Prüfung."],["تنظيم طلبات العلاج الفيزيائي وربطها بالمعالجين الفيزيائيين، بينما يبقى التقييم والخطة للاختصاصي.","Organizing physiotherapy requests and connecting families with physiotherapists; assessment and treatment plans remain the specialist’s responsibility.","Organisation des demandes de kinésithérapie et mise en relation avec des kinésithérapeutes ; l’évaluation et le plan de traitement relèvent du spécialiste.","Organizzazione delle richieste di fisioterapia e collegamento con i fisioterapisti; la valutazione e il piano restano di competenza dello specialista.","Organisation von Physiotherapieanfragen und Vermittlung an Physiotherapeuten; Beurteilung und Behandlungsplan bleiben Aufgabe der Fachkraft."],["الخدمات الصحية المساندة","Supporting healthcare services","Services de santé complémentaires","Servizi sanitari di supporto","Ergänzende Gesundheitsleistungen"],["شبكة تتوسع تدريجيًا لتشمل المختبرات والتصوير والمعدات الطبية والخدمات المساندة بعد التواصل والمراجعة والاتفاق.","A growing network of laboratories, imaging centers, medical equipment, and support services, added after contact, review, and agreement.","Un réseau en développement comprenant laboratoires, centres d’imagerie, matériel médical et services complémentaires, après prise de contact, examen et accord.","Una rete in espansione che comprende laboratori, centri diagnostici, attrezzature mediche e servizi di supporto, dopo contatto, verifica e accordo.","Ein wachsendes Netzwerk aus Laboren, Bildgebungszentren, medizinischen Geräten und ergänzenden Leistungen nach Kontakt, Prüfung und Vereinbarung."],["عرض شبكة الخدمات","View the service network","Voir le réseau de services","Visualizza la rete di servizi","Servicenetz ansehen"],["📄 خدمة إعداد الـCV من RAFIQ","📄 RAFIQ CV preparation service","📄 Service de création de CV RAFIQ","📄 Servizio RAFIQ per la creazione del CV","📄 RAFIQ-Lebenslaufservice"],["إعداد ملف مهني واضح ومرتب لمقدمي الرعاية والباحثين عن فرص العمل.","Preparation of a clear, well-structured professional profile for caregivers and job seekers.","Création d’un profil professionnel clair et structuré pour les auxiliaires de vie et les personnes en recherche d’emploi.","Preparazione di un profilo professionale chiaro e ordinato per assistenti alla cura e persone in cerca di lavoro.","Erstellung eines klaren, gut strukturierten beruflichen Profils für Betreuungskräfte und Arbeitssuchende."],["CV احترافي + Cover Letter","Professional CV + cover letter","CV professionnel + lettre de motivation","CV professionale + lettera di presentazione","Professioneller Lebenslauf + Anschreiben"],["إضافة لغة أخرى متاحة حسب الخدمة المطلوبة.","An additional language is available depending on the requested service.","Une langue supplémentaire est disponible selon le service demandé.","È disponibile una lingua aggiuntiva in base al servizio richiesto.","Eine zusätzliche Sprache ist je nach gewünschter Leistung verfügbar."],["📄 اطلب إعداد الـCV الآن","📄 Request your CV now","📄 Demander la création de votre CV","📄 Richiedi ora il tuo CV","📄 Lebenslauf jetzt erstellen lassen"],["رسائل رفيق للمنتسبين","Messages from RAFIQ for members","Les messages de RAFIQ aux membres","Messaggi di RAFIQ per gli iscritti","Nachrichten von RAFIQ für Mitglieder"],["كل فئة لها مكان واضح ودور مهم في بناء شبكة رعاية موثوقة.","Every group has a clear place and an important role in building a trusted care network.","Chaque catégorie a une place claire et un rôle essentiel dans la construction d’un réseau de soins fiable.","Ogni categoria ha un ruolo chiaro e importante nella creazione di una rete di assistenza affidabile.","Jede Gruppe hat einen klaren Platz und eine wichtige Rolle beim Aufbau eines verlässlichen Betreuungsnetzwerks."],["👨‍👩‍👧 للعائلات ومقدمي الطلبات","👨‍👩‍👧 For families and applicants","👨‍👩‍👧 Pour les familles et les demandeurs","👨‍👩‍👧 Per famiglie e richiedenti","👨‍👩‍👧 Für Familien und Antragsteller"],["أهلًا بكم في RAFIQ. طلبكم هو نقطة البداية لفهم احتياج العائلة وتنظيمه ومراجعته للوصول إلى الخدمة المناسبة.","Welcome to RAFIQ. Your request is the starting point for understanding, organizing, and reviewing your family’s needs so we can identify a suitable service.","Bienvenue chez RAFIQ. Votre demande nous aide à comprendre, organiser et examiner les besoins de votre famille afin d’identifier le service adapté.","Benvenuti in RAFIQ. La vostra richiesta è il punto di partenza per comprendere, organizzare e valutare le esigenze della famiglia e individuare il servizio più adatto.","Willkommen bei RAFIQ. Ihre Anfrage ist der Ausgangspunkt, um den Bedarf Ihrer Familie zu verstehen, zu ordnen und zu prüfen und eine passende Leistung zu finden."],["🤝 لمقدمي الرعاية","🤝 For caregivers","🤝 Pour les auxiliaires de vie","🤝 Per gli assistenti alla cura","🤝 Für Betreuungskräfte"],["وجودكم يضيف خبرتكم الإنسانية والمهنية إلى شبكة RAFIQ. نساعد على تنظيم ملفكم وخدماتكم ومناطق العمل ليصبح الوصول إليكم أوضح عند وجود طلب مناسب.","Your presence adds valuable human and professional experience to RAFIQ. We organize your profile, services, and work areas so families can find you when a suitable request arises.","Votre présence apporte une expérience humaine et professionnelle précieuse à RAFIQ. Nous organisons votre profil, vos services et vos zones d’intervention afin de faciliter votre mise en relation avec les familles.","La vostra presenza aggiunge esperienza umana e professionale a RAFIQ. Organizziamo il profilo, i servizi e le aree di lavoro per facilitare il contatto con le famiglie quando arriva una richiesta adatta.","Ihre Erfahrung erweitert das menschliche und fachliche Angebot von RAFIQ. Wir strukturieren Ihr Profil, Ihre Leistungen und Einsatzgebiete, damit Familien Sie bei passenden Anfragen leichter finden."],["👩‍⚕️ للممرضين والمعالجين الفيزيائيين","👩‍⚕️ For nurses and physiotherapists","👩‍⚕️ Pour les infirmiers et les kinésithérapeutes","👩‍⚕️ Per infermieri e fisioterapisti","👩‍⚕️ Für Pflegekräfte und Physiotherapeuten"],["خبرتكم جزء أساسي من شبكة الرعاية. الانضمام المنظم يساعد العائلات على الوصول إلى الاختصاص المناسب، مع مراجعة الإدارة للملفات.","Your expertise is an essential part of the care network. Structured membership helps families find the right specialty, with profiles reviewed by management.","Votre expertise est essentielle au réseau de soins. Une adhésion structurée aide les familles à trouver la spécialité appropriée, après examen des dossiers par la direction.","La vostra competenza è essenziale per la rete di assistenza. Un’iscrizione organizzata aiuta le famiglie a trovare la specializzazione giusta, previa verifica dei profili da parte della direzione.","Ihre Fachkenntnisse sind ein wesentlicher Bestandteil des Betreuungsnetzwerks. Eine strukturierte Aufnahme hilft Familien, die passende Fachrichtung zu finden; die Profile werden von der Leitung geprüft."],["🧪 للجهات الصحية والمساندة","🧪 For healthcare and support providers","🧪 Pour les établissements de santé et de services complémentaires","🧪 Per strutture sanitarie e servizi di supporto","🧪 Für Gesundheits- und Unterstützungseinrichtungen"],["المختبرات ومراكز الأشعة والمعدات والخدمات المساندة شركاء مهمون في منظومة الرعاية، ويُبنى التعاون بعد التواصل والمراجعة والاتفاق الواضح.","Laboratories, imaging centers, equipment providers, and support services are important partners. Cooperation begins after contact, review, and a clear agreement.","Les laboratoires, centres d’imagerie, fournisseurs de matériel et services complémentaires sont des partenaires importants. La coopération commence après prise de contact, examen et accord clair.","Laboratori, centri diagnostici, fornitori di attrezzature e servizi di supporto sono partner importanti. La collaborazione inizia dopo contatto, verifica e accordo chiaro.","Labore, Bildgebungszentren, Geräteanbieter und ergänzende Dienste sind wichtige Partner. Eine Zusammenarbeit beginnt nach Kontakt, Prüfung und klarer Vereinbarung."],["التوسع القادم","Coming next","Prochaines étapes","Prossimi sviluppi","Nächste Erweiterungen"],["إضافة تدريجية ضمن شبكة الخدمات المتخصصة.","A gradual addition to the specialized service network.","Une intégration progressive au réseau de services spécialisés.","Un’aggiunta graduale alla rete dei servizi specializzati.","Eine schrittweise Ergänzung des spezialisierten Servicenetzes."],["توسيع شبكة الدعم الصحي للعائلات والمنتسبين.","Expanding the healthcare support network for families and members.","Élargir le réseau de soutien sanitaire pour les familles et les membres.","Ampliare la rete di supporto sanitario per famiglie e iscritti.","Ausbau des Gesundheitsunterstützungsnetzes für Familien und Mitglieder."],["خدمات مساندة إضافية ضمن خطة التوسع.","Additional support services as part of the expansion plan.","Des services complémentaires dans le cadre du plan d’expansion.","Ulteriori servizi di supporto nell’ambito del piano di espansione.","Zusätzliche Unterstützungsleistungen im Rahmen des Ausbauplans."],["شبكة خدمات مساندة بعد التواصل والاتفاق والمراجعة.","A support-services network following contact, agreement, and review.","Un réseau de services complémentaires après prise de contact, accord et examen.","Una rete di servizi di supporto dopo contatto, accordo e verifica.","Ein Netzwerk ergänzender Leistungen nach Kontakt, Vereinbarung und Prüfung."],["📲 قنوات RAFIQ الرسمية","📲 Official RAFIQ channels","📲 Canaux officiels de RAFIQ","📲 Canali ufficiali RAFIQ","📲 Offizielle RAFIQ-Kanäle"],["للاستفسارات والتحديثات والتواصل المباشر.","For enquiries, updates, and direct communication.","Pour les questions, les actualités et la communication directe.","Per domande, aggiornamenti e comunicazioni dirette.","Für Anfragen, Neuigkeiten und direkte Kommunikation."],["🤖 بوت Telegram","🤖 Telegram bot","🤖 Bot Telegram","🤖 Bot Telegram","🤖 Telegram-Bot"],["📢 قناة Telegram","📢 Telegram channel","📢 Canal Telegram","📢 Canale Telegram","📢 Telegram-Kanal"],["📢 قناة WhatsApp","📢 WhatsApp channel","📢 Canal WhatsApp","📢 Canale WhatsApp","📢 WhatsApp-Kanal"],["💬 WhatsApp الإدارة","💬 RAFIQ management on WhatsApp","💬 WhatsApp de la direction RAFIQ","💬 WhatsApp della direzione RAFIQ","💬 RAFIQ-Leitung auf WhatsApp"],["المراسلات الرسمية: +961 81 506 299 · تفاصيل التحويلات المالية تُعطى من الإدارة عند الحاجة.","Official correspondence: +961 81 506 299 · Transfer details are provided by management when needed.","Correspondance officielle : +961 81 506 299 · Les détails de virement sont communiqués par la direction si nécessaire.","Comunicazioni ufficiali: +961 81 506 299 · I dettagli per i trasferimenti vengono forniti dalla direzione se necessario.","Offizielle Korrespondenz: +961 81 506 299 · Überweisungsdetails werden bei Bedarf von der Leitung mitgeteilt."],["© RAFIQ | رفيق · issaapplication@gmail.com","© RAFIQ | Rafiq · issaapplication@gmail.com","© RAFIQ | Rafiq · issaapplication@gmail.com","© RAFIQ | Rafiq · issaapplication@gmail.com","© RAFIQ | Rafiq · issaapplication@gmail.com"],["نوع الملف غير مسموح. ارفع PDF أو JPG أو PNG فقط.","File type not allowed. Upload PDF, JPG, or PNG only.","Type de fichier non autorisé. Téléversez uniquement un PDF, JPG ou PNG.","Tipo di file non consentito. Carica solo PDF, JPG o PNG.","Dateityp nicht zulässig. Laden Sie nur PDF, JPG oder PNG hoch."],["حجم الملف يتجاوز 8 ميغابايت.","The file exceeds 8 MB.","Le fichier dépasse 8 Mo.","Il file supera 8 MB.","Die Datei ist größer als 8 MB."],["حجم الملف يجب أن يكون أكبر من صفر وألا يتجاوز 8 ميغابايت.","The file size must be greater than zero and no more than 8 MB.","La taille du fichier doit être supérieure à zéro et ne pas dépasser 8 Mo.","La dimensione del file deve essere maggiore di zero e non superare 8 MB.","Die Dateigröße muss größer als null und darf höchstens 8 MB sein."],["يمكن إرفاق 8 ملفات كحد أقصى.","You can attach up to 8 files.","Vous pouvez joindre jusqu’à 8 fichiers.","Puoi allegare al massimo 8 file.","Sie können höchstens 8 Dateien anhängen."],["يرجى الموافقة على مراجعة البيانات قبل الإرسال.","Please agree to the data review before submitting.","Veuillez accepter l’examen des données avant l’envoi.","Acconsenti alla verifica dei dati prima dell’invio.","Bitte stimmen Sie der Prüfung der Angaben vor dem Absenden zu."],["تم تجاوز عدد المحاولات. يرجى الانتظار قليلًا ثم إعادة المحاولة.","Too many attempts. Please wait a moment and try again.","Trop de tentatives. Veuillez patienter un instant puis réessayer.","Troppi tentativi. Attendi un momento e riprova.","Zu viele Versuche. Bitte warten Sie kurz und versuchen Sie es erneut."],["خدمة استقبال الطلبات غير جاهزة حاليًا. يرجى المحاولة لاحقًا.","The request intake service is temporarily unavailable. Please try again later.","Le service de réception des demandes est temporairement indisponible. Veuillez réessayer plus tard.","Il servizio di ricezione delle richieste non è al momento disponibile. Riprova più tardi.","Der Dienst zur Annahme von Anfragen ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut."],["تعذر حفظ أحد الملفات. لم يُعتمد الطلب؛ يرجى إعادة المحاولة.","A file could not be saved. The request was not accepted; please try again.","Impossible d’enregistrer un fichier. La demande n’a pas été acceptée ; veuillez réessayer.","Impossibile salvare un file. La richiesta non è stata accettata; riprova.","Eine Datei konnte nicht gespeichert werden. Die Anfrage wurde nicht angenommen; bitte versuchen Sie es erneut."],["تعذر حفظ الطلب الآن. حاول مرة أخرى لاحقًا.","The request could not be saved. Please try again later.","La demande n’a pas pu être enregistrée. Veuillez réessayer plus tard.","Impossibile salvare la richiesta. Riprova più tardi.","Die Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut."],["يرجى إرفاق جميع الوثائق المطلوبة قبل الإرسال.","Please attach all required documents before submitting.","Veuillez joindre tous les documents requis avant l’envoi.","Allega tutti i documenti richiesti prima dell’invio.","Bitte fügen Sie vor dem Absenden alle erforderlichen Dokumente bei."],["تم استلام الطلب.","Your request has been received.","Votre demande a été reçue.","La richiesta è stata ricevuta.","Ihre Anfrage ist eingegangen."],["جارٍ إرسال طلبك إلى إدارة RAFIQ للمراجعة…","Sending your request to RAFIQ management for review…","Envoi de votre demande à la direction de RAFIQ pour examen…","Invio della richiesta alla direzione RAFIQ per la verifica…","Ihre Anfrage wird zur Prüfung an die RAFIQ-Leitung gesendet …"],["تم استلام طلبك وسنتواصل معك بعد مراجعة الإدارة.","Your request has been received. We will contact you after management review.","Votre demande a été reçue. Nous vous contacterons après examen par la direction.","La richiesta è stata ricevuta. Ti contatteremo dopo la verifica della direzione.","Ihre Anfrage ist eingegangen. Wir kontaktieren Sie nach Prüfung durch die Leitung."],["رقم الطلب:","Request number:","Numéro de demande :","Numero richiesta:","Anfragenummer:"],["تعذر إرسال الطلب. حاول مرة أخرى.","The request could not be submitted. Please try again.","Impossible d’envoyer la demande. Veuillez réessayer.","Impossibile inviare la richiesta. Riprova.","Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut."]].forEach(function (row) {
    inlineTextTranslations[normalizeSource(row[0])] = { en: row[1], fr: row[2], it: row[3], de: row[4] };
  });

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
    var target = lang || current;
    if (!normalized) return null;
    if (target === DEFAULT) return normalized;
    var direct = inlineTextTranslations[normalized];
    if (direct && Object.prototype.hasOwnProperty.call(direct, target)) return direct[target];
    var key = sourceToKey[normalized];
    if (key) return translate(key, target);

    // Preserve dynamic suffixes such as a request number after a translated label.
    var candidates = Object.keys(inlineTextTranslations).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < candidates.length; i++) {
      var source = candidates[i];
      if (normalized.indexOf(source + ' ') === 0) {
        var prefix = inlineTextTranslations[source][target];
        if (prefix) return prefix + normalized.slice(source.length);
      }
    }
    return null;
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
      if (!parent || parent.closest('script,style,template,.ra-lang,.ra-untranslated,[data-i18n]')) continue;
      if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
      var source = originalTextNodes.get(node);
      var translated = lang === DEFAULT ? source : translateSource(source, lang);
      var next = translated == null || translated === '' ? source : translated;
      var leading = source.match(/^\\s*/)?.[0] || '';
      var trailing = source.match(/\\s*$/)?.[0] || '';
      next = leading + next + trailing;
      if (node.nodeValue !== next) {
        node.nodeValue = next;
        changed++;
      }
    }
    return changed;
  }

  function translateAttributes(lang) {
    var changed = 0;
    var attrs = ['title', 'alt', 'aria-label', 'placeholder'];
    var els = document.querySelectorAll('[title],[alt],[aria-label],[placeholder]');
    function applyAttribute(el, name) {
      var stored = originalAttributes.get(el) || Object.create(null);
      if (!Object.prototype.hasOwnProperty.call(stored, name)) stored[name] = el.getAttribute(name);
      originalAttributes.set(el, stored);
      var source = stored[name];
      var translated = lang === DEFAULT ? source : translateSource(source, lang);
      var next = translated == null || translated === '' ? source : translated;
      if (el.getAttribute(name) !== next) {
        el.setAttribute(name, next);
        changed++;
      }
    }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.ra-lang,script,style,template')) continue;
      for (var j = 0; j < attrs.length; j++) {
        if (el.hasAttribute(attrs[j])) applyAttribute(el, attrs[j]);
      }
    }

    var metas = document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]');
    for (var k = 0; k < metas.length; k++) {
      var meta = metas[k];
      var saved = originalAttributes.get(meta) || Object.create(null);
      if (!Object.prototype.hasOwnProperty.call(saved, 'content')) saved.content = meta.getAttribute('content') || '';
      originalAttributes.set(meta, saved);
      var sourceContent = saved.content;
      var translatedContent = lang === DEFAULT ? sourceContent : translateSource(sourceContent, lang);
      var nextContent = translatedContent == null || translatedContent === '' ? sourceContent : translatedContent;
      if (meta.getAttribute('content') !== nextContent) {
        meta.setAttribute('content', nextContent);
        changed++;
      }
    }
    return changed;
  }


  function ensureDirectionStyles() {
    if (document.getElementById('ra-i18n-direction-style')) return;
    var style = document.createElement('style');
    style.id = 'ra-i18n-direction-style';
    style.textContent = [
      'html.ra-ltr,html.ra-ltr body{direction:ltr!important}',
      'html.ra-ltr input:not([type="checkbox"]):not([type="radio"]),html.ra-ltr select,html.ra-ltr textarea{direction:ltr;text-align:left}',
      'html.ra-ltr .field,html.ra-ltr .menu-panel,html.ra-ltr .notice,html.ra-ltr .form-message{ text-align:left }',
      'html:not(.ra-ltr),html:not(.ra-ltr) body{direction:rtl}',
      'html.ra-ltr .ra-lang,html.ra-ltr .ra-lang-menu,html.ra-ltr .ra-lang-btn{direction:ltr}'
    ].join('');
    document.head.appendChild(style);
  }

  function updateDynamicMessages(lang) {
    var messages = document.querySelectorAll('[data-rafig-source-text]');
    for (var i = 0; i < messages.length; i++) {
      var source = messages[i].getAttribute('data-rafig-source-text') || '';
      var lines = source.split('\\n');
      var translatedLines = lines.map(function (line) {
        var value = translateSource(line, lang);
        return value == null || value === '' ? line : value;
      });
      messages[i].textContent = translatedLines.join('\\n');
    }
  }

  /* Apply a language to the current page */
  function apply(code, opts) {
    opts = opts || {};
    if (!isKnown(code)) code = DEFAULT;
    current = code;
    write(code);

    var m = langMeta(code);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', m.dir);
    document.documentElement.classList.toggle('ra-ltr', m.dir === 'ltr');
    ensureDirectionStyles();

    var titleKey = document.body ? document.body.getAttribute('data-i18n-title') : null;
    var titleTranslation = titleKey ? translate(titleKey, code) : null;
    if (!titleTranslation) titleTranslation = translateSource(originalDocumentTitle, code);
    document.title = titleTranslation || originalDocumentTitle;

    var marked = document.querySelectorAll('[data-i18n]');
    var filled = 0, missing = 0;
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var key = el.getAttribute('data-i18n');
      if (!originalMarkedText.has(el) && el.textContent) originalMarkedText.set(el, el.textContent);
      var original = originalMarkedText.has(el) ? originalMarkedText.get(el) : '';
      var val = translate(key, code);
      var next = val !== null && val !== '' ? val : original;
      if (val === null || val === '') missing++;
      if (el.textContent !== next) el.textContent = next;
      if (val !== null && val !== '') filled++;
    }

    filled += translateLegacyPage(code);
    filled += translateAttributes(code);

    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      var placeholderKey = ph[j].getAttribute('data-i18n-placeholder');
      var placeholderValue = translate(placeholderKey, code);
      if (placeholderValue) ph[j].setAttribute('placeholder', placeholderValue);
    }

    var al = document.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < al.length; k++) {
      var ariaKey = al[k].getAttribute('data-i18n-aria');
      var ariaValue = translate(ariaKey, code);
      if (ariaValue) al[k].setAttribute('aria-label', ariaValue);
    }

    updateDynamicMessages(code);
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
    var requestId = ++switchSequence;
    return Promise.all([loadScript(DEFAULT), loadScript(code)]).then(function () {
      if (requestId !== switchSequence) return { lang: current, dir: langMeta(current).dir, superseded: true };
      var result = apply(code);
      var widget = document.querySelector('.ra-lang');
      if (widget) {
        paintButton(widget.querySelector('.ra-lang-btn'), widget.querySelector('.ra-lang-menu'),
                    widget.querySelector('.note'), code);
      }
      return result;
    });
  }

  function start() {
    if (startPromise) return startPromise;
    var saved = read();
    var auto = false;
    var want;
    if (saved && isKnown(saved)) {
      want = saved;
    } else {
      want = detect();
      auto = detected !== null;
      write(want);
    }
    buildButton();
    startPromise = Promise.all([loadScript(DEFAULT), loadScript(want)]).then(function () {
      return setLanguage(want).then(function (result) {
        result.auto = auto;
        result.detected = detected;
        return result;
      });
    }).catch(function (error) {
      startPromise = null;
      throw error;
    });
    return startPromise;
  }

  return {
    start: start,
    setLanguage: setLanguage,
    apply: apply,
    register: register,
    translate: translate,
    translateText: function (text, lang) { return translateSource(text, lang || current); },
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

document.addEventListener('rafiq:i18n:refresh', function () {
  RAFIQ_I18N.setLanguage(RAFIQ_I18N.current).catch(function (error) {
    console.error('RAFIQ i18n refresh failed', error);
  });
});

/* Start automatically on every public page. */
(function () {
  function boot() { try { RAFIQ_I18N.start(); } catch (e) { console.error('RAFIQ i18n boot failed', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RAFIQ_I18N;