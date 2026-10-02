/* RAFIQ multilingual UI — Arabic is the source/default language. */
(function () {
  'use strict';

  const LANGS = {
    ar: { label: 'العربية', dir: 'rtl', locale: 'ar-LB' },
    en: { label: 'English', dir: 'ltr', locale: 'en-LB' },
    fr: { label: 'Français', dir: 'ltr', locale: 'fr-FR' },
    it: { label: 'Italiano', dir: 'ltr', locale: 'it-IT' },
    de: { label: 'Deutsch', dir: 'ltr', locale: 'de-DE' }
  };

  const T = {
    en: {
      'الرئيسية':'Home','الخدمات':'Services','طلب رعاية أو انتساب':'Care or Membership Request','دليل الرعاية':'Care Guide','الأسئلة الشائعة':'FAQ','المناطق':'Regions','مقدمو الرعاية':'Care Providers','مساعد رفيق':'RAFIQ Assistant',
      'القائمة':'Menu','شعار RAFIQ':'RAFIQ logo','شعار RAFIQ الرسمي':'Official RAFIQ logo',
      'رفيق | RAFIQ':'RAFIQ | Rafiq','نصل بالحب والأمان لرعاية العائلة':'We reach the family with care and safety',
      'منصة رعاية منزلية وخدمات صحية في لبنان':'Home-care and health-services platform in Lebanon',
      'رعاية منزلية وخدمات صحية ومساندة للعائلات والمنتسبين إلى RAFIQ في لبنان.':'Home-care, health and support services for families and RAFIQ members in Lebanon.',
      'منصة لتنظيم خدمات الرعاية المنزلية والصحية في لبنان وربط العائلات بمقدمي الخدمات.':'A platform that organizes home-care and health services in Lebanon and connects families with service providers.',
      'أهلًا بكم في رفيق 🌿 اليوم نبدأ بخطوة بسيطة نحو رعاية أكثر تنظيمًا وأمانًا للعائلة.':'Welcome to RAFIQ 🌿 Today we take a simple step toward more organized and safer family care.',
      'مرحبًا بكم في RAFIQ 🤍 وجودكم مهم؛ أخبرونا بما تحتاجه العائلة وسنرتب الطلب بوضوح.':'Welcome to RAFIQ 🤍 You matter. Tell us what the family needs and we will organize the request clearly.',
      'صباح/مساء الخير من رفيق 🌿 الرعاية تبدأ بالاستماع وفهم الاحتياج قبل اختيار الخدمة.':'Greetings from RAFIQ 🌿 Care begins by listening and understanding the need before choosing a service.',
      'أهلًا بكم 🤝 رفيق يجمع العائلات وأصحاب الخبرة ضمن شبكة رعاية منظمة في لبنان.':'Welcome 🤝 RAFIQ brings families and experienced providers together in an organized care network in Lebanon.',
      'مرحبًا بكم في RAFIQ 🏡 هدفنا أن تكون رحلة طلب الرعاية أسهل وأوضح للعائلة والمنتسب.':'Welcome to RAFIQ 🏡 Our goal is to make the care-request journey easier and clearer for families and members.',
      'أهلًا بكم 🌸 لكل مسن ومريض وعائلة ومقدم خدمة مكان مهم في منظومة رفيق.':'Welcome 🌸 Every older person, patient, family and provider has an important place in RAFIQ.',
      'مرحبًا بكم في رفيق 💚 نبدأ من احتياجكم، وننظم المعلومات، ثم نترك قرارات الاعتماد والمطابقة للإدارة.':'Welcome to RAFIQ 💚 We start with your needs, organize the information, and leave approval and matching decisions to management.',
      'طلب رعاية أو انتساب':'Care or Membership Request','واتساب RAFIQ':'RAFIQ WhatsApp','📲 تثبيت تطبيق رفيق':'📲 Install RAFIQ','استكشف الخدمات':'Explore Services',
      'كيف تساعد RAFIQ؟':'How does RAFIQ help?','واجهة مختصرة وواضحة للعائلة وللمنتسبين، مع وصول سريع إلى الخدمة المطلوبة.':'A clear, simple interface for families and members, with quick access to the needed service.',
      'رعاية كبار السن':'Elderly Care','التمريض المنزلي':'Home Nursing','العلاج الفيزيائي':'Physiotherapy','الخدمات الصحية المساندة':'Supporting Health Services',
      'تنظيم احتياجات الرعاية اليومية والليلية والمساعدة المنزلية وفق معلومات الحالة.':'Organizing daily and overnight care needs and home assistance based on the case information.',
      'تنظيم طلبات التمريض وربطها بالاختصاص والخبرة والمنطقة بعد المراجعة.':'Organizing nursing requests and matching them by specialty, experience and area after review.',
      'طلبات العلاج الفيزيائي وربطها بالمعالجين ضمن شبكة RAFIQ.':'Organizing physiotherapy requests and connecting them with therapists in the RAFIQ network.',
      'شبكة تتوسع لتشمل المختبرات والتصوير والمعدات وغيرها وفق الاتفاق والمراجعة.':'A network expanding to laboratories, imaging, medical equipment and other services after review and agreement.',
      'تفاصيل الرعاية':'Care Details','تفاصيل التمريض':'Nursing Details','تفاصيل العلاج الفيزيائي':'Physiotherapy Details','عرض شبكة الخدمات':'View Service Network',
      'رسائل رفيق للمنتسبين':'RAFIQ Messages for Members','كل فئة لها مكان واضح ودور مهم في بناء شبكة رعاية موثوقة.':'Every group has a clear role in building a trusted care network.',
      '👨‍👩‍👧 للعائلات ومقدمي الطلبات':'👨‍👩‍👧 For Families and Requesters','أهلًا بكم في RAFIQ. طلبكم هو نقطة البداية لفهم احتياج العائلة وتنظيمه ومراجعته للوصول إلى الخدمة المناسبة.':'Welcome to RAFIQ. Your request is the starting point for understanding, organizing and reviewing the family’s needs to reach the appropriate service.',
      '🤝 لمقدمي الرعاية':'🤝 For Care Providers','وجودكم يضيف خبرتكم الإنسانية والمهنية إلى شبكة RAFIQ. نساعد على تنظيم ملفكم وخدماتكم ومناطق العمل ليصبح الوصول إليكم أوضح عند وجود طلب مناسب.':'Your presence adds your human and professional experience to RAFIQ. We organize your profile, services and work areas so you can be reached more clearly when a suitable request exists.',
      '👩‍⚕️ للممرضين والمعالجين الفيزيائيين':'👩‍⚕️ For Nurses and Physiotherapists','خبرتكم جزء أساسي من شبكة الرعاية. الانضمام المنظم يساعد العائلات على الوصول إلى الاختصاص المناسب، مع مراجعة الإدارة للملفات.':'Your experience is an essential part of the care network. Organized membership helps families reach the right specialty, with management reviewing applications.',
      '🧪 للجهات الصحية والمساندة':'🧪 For Health and Support Providers','المختبرات ومراكز الأشعة والمعدات والخدمات المساندة شركاء مهمون في منظومة الرعاية، ويُبنى التعاون بعد التواصل والمراجعة والاتفاق الواضح.':'Laboratories, imaging centers, medical equipment and support services are important partners in care. Cooperation is established after contact, review and a clear agreement.',
      'رعاية حقيقية تبدأ من التفاصيل':'Real care starts with the details','صور توضيحية واقعية لسيناريوهات الخدمة، موزعة حسب الاختصاص.':'Realistic illustrative images of service scenarios, organized by specialty.',
      'رفقة ودعم في الحياة اليومية':'Companionship and daily support','رعاية المسنين لا تقتصر على المساعدة؛ بل تشمل الرفقة والاهتمام والاستقلالية قدر الإمكان.':'Elderly care is not limited to assistance; it also includes companionship, attention and independence whenever possible.',
      'المساعدة أثناء الوجبات':'Assistance during meals','المساعدة اليومية قد تشمل دعم المسن أثناء تناول الطعام وفق احتياجاته وتعليمات الأسرة.':'Daily assistance may include helping an older person during meals according to their needs and the family’s instructions.',
      'الصورة: Pexels — صورة مجانية للاستخدام.':'Image: Pexels — free to use.',
      'التوسع القادم':'Coming Soon','⏳ انتظرونا قريبًا':'⏳ Coming soon','🦷 أطباء الأسنان':'🦷 Dentists','🥗 اختصاصيو التغذية':'🥗 Nutritionists','🗣️ اختصاصيو النطق':'🗣️ Speech Specialists','🩺 خدمات ومعدات طبية':'🩺 Medical Services and Equipment',
      'إضافة تدريجية ضمن شبكة الخدمات المتخصصة.':'A gradual addition to the specialized service network.','توسيع شبكة الدعم الصحي للعائلات والمنتسبين.':'Expanding health support for families and members.','خدمات مساندة إضافية ضمن خطة التوسع.':'Additional support services as part of the expansion plan.','شبكة خدمات مساندة بعد التواصل والاتفاق والمراجعة.':'A support-services network after contact, agreement and review.',
      'نصل بالحب والأمان لرعاية العائلة':'We reach the family with care and safety','المراسلات الرسمية: +961 81 506 299 · الأمور المالية والتحويلات فقط: +961 70 600 157':'Official correspondence: +961 81 506 299 · Financial transfers only: +961 70 600 157',
      'المراسلات: +961 81 506 299':'Correspondence: +961 81 506 299',
      '© RAFIQ | رفيق · issaapplication@gmail.com':'© RAFIQ | Rafiq · issaapplication@gmail.com',
      'خدمات RAFIQ':'RAFIQ Services','نرتب احتياج العائلة، نجمع المعلومات الأساسية، ثم تتم مراجعة الطلب ومطابقته وفق الخدمة والاختصاص والمنطقة.':'We organize the family’s needs, collect the essential information, then review and match the request by service, specialty and area.',
      '📝 ابدأ طلبك':'📝 Start Your Request','💬 تواصل عبر واتساب':'💬 Contact via WhatsApp','المزيد':'More',
      'تنظيم طلبات التمريض وفق الاختصاص والخبرة ومتطلبات الحالة، مع الالتزام بحدود الدور المهني.':'Organizing nursing requests by specialty, experience and case requirements, within professional role boundaries.',
      'توسيع الشبكة لتشمل المختبرات ومراكز الأشعة والمعدات الطبية والخدمات المساندة وفق التواصل والمراجعة والاتفاق.':'Expanding the network to laboratories, imaging centers, medical equipment and support services after contact, review and agreement.',
      'رسالة RAFIQ لمقدمي الخدمة':'RAFIQ Message for Service Providers',
      'أهلًا بكم في شبكة رفيق. وجود مقدم الخدمة مهم لأنه يضيف خبرة حقيقية إلى المنصة ويمنح العائلات خيارات منظمة عند وجود طلب مناسب. يتم تسجيل المعلومات والوثائق للمراجعة، ولا يعني التسجيل وحده اعتمادًا نهائيًا أو وعدًا بطلبات.':'Welcome to the RAFIQ network. Service providers add real expertise to the platform and give families organized options when a suitable request exists. Information and documents are recorded for review; registration alone does not mean final approval or a promise of requests.',
      'خدمات قادمة':'Upcoming Services','أطباء من مختلف الاختصاصات':'Doctors from different specialties','ضمن توسع شبكة RAFIQ الصحية.':'As RAFIQ expands its health network.','خدمات مساندة للعائلات والمنتسبين.':'Support services for families and members.','إضافة مستقبلية ضمن الشبكة المتخصصة.':'A future addition to the specialized network.','ضمن خطة التوسع التدريجي.':'As part of the gradual expansion plan.',
      'RAFIQ | التسجيل والتقديم':'RAFIQ | Registration and Applications','تسجيل وتقديم سهل من الهاتف أو الكمبيوتر. نعمل على استقبال الطلبات وبناء قاعدة مهنية موثوقة تمهيدًا للإطلاق التشغيلي الكامل.':'Easy registration and applications from phone or computer. We receive requests and build a trusted professional base ahead of full operational launch.',
      'مهم:':'Important:','التسجيل لا يعني القبول أو التوظيف أو توقيع عقد. كل طلب يخضع للمراجعة والتحقق.':'Registration does not mean acceptance, employment or contract signing. Every request is subject to review and verification.',
      '🔐 الدخول أو إنشاء حساب':'🔐 Sign in or Create an Account','البريد الإلكتروني':'Email','كلمة المرور':'Password','دخول':'Sign in','إنشاء حساب جديد':'Create New Account',
      'إذا كان تأكيد البريد الإلكتروني مفعّلًا، أكّد بريدك أولًا ثم استخدم زر الدخول.':'If email confirmation is enabled, confirm your email first, then use Sign in.',
      '📝 اختر نوع الطلب':'📝 Choose Request Type','🤝 مقدم/ة رعاية':'🤝 Caregiver','رعاية كبار السن والمساعدة المنزلية.':'Elderly care and home assistance.','بدء التقديم':'Start Application',
      '👩‍⚕️ ممرض/ة':'👩‍⚕️ Nurse','اختصاص، خبرة، مؤهلات ومناطق العمل.':'Specialty, experience, qualifications and work areas.',
      '🧑‍🦽 معالج/ة فيزيائي/ة':'🧑‍🦽 Physiotherapist','اختصاص، خبرة، خدمات ومناطق العمل.':'Specialty, experience, services and work areas.',
      '👨‍👩‍👧 عائلة':'👨‍👩‍👧 Family','تقديم طلب رعاية لشخص من العائلة.':'Submit a care request for a family member.','تقديم طلب رعاية':'Submit Care Request',
      'التقديم':'Application','الاسم الأول':'First name','اسم العائلة':'Last name','اسم الأب':'Father’s name','تاريخ الميلاد':'Date of birth','رقم الهاتف':'Phone number','العنوان':'Address',
      'منطقة العمل المطلوبة — اختر المحافظة ثم القضاء ثم المنطقة الرئيسية':'Preferred work area — choose governorate, district and main locality',
      'المحافظة':'Governorate','القضاء':'District','المنطقة':'Locality','اللغات':'Languages','الاختصاص':'Specialty','الخبرة':'Experience','الخدمات التي تقدمها':'Services you provide','ملاحظات إضافية':'Additional notes',
      'السيرة الذاتية CV — اختياري في مرحلة التسجيل':'CV — optional during registration','اسم طالب الرعاية':'Requester name','اسم الشخص المحتاج للرعاية':'Person needing care','العمر':'Age',
      'منطقة الرعاية — اختر المحافظة ثم القضاء ثم المنطقة الرئيسية':'Care area — choose governorate, district and main locality','نوع الخدمة':'Service type','الجدول المطلوب':'Requested schedule','احتياجات أو ملاحظات الطلب':'Request needs or notes',
      'أقر بصحة المعلومات وأوافق على معالجة بياناتي بالقدر اللازم لمراجعة الطلب وإدارة المنصة.':'I confirm that the information is accurate and agree to processing my data as necessary to review the request and manage the platform.',
      'إرسال الطلب للمراجعة':'Submit Request for Review','🤖 مساعد رفيق':'🤖 RAFIQ Assistant','يمكنك التحدث مع مساعد RAFIQ قبل تقديم الطلب للحصول على توجيه أولي حول الخدمات.':'You can talk to the RAFIQ Assistant before submitting a request for initial guidance about services.',
      'فتح مساعد رفيق':'Open RAFIQ Assistant','الصفحة الرئيسية':'Home Page','🛡️ RAFIQ على الهواتف والأنظمة المختلفة':'🛡️ RAFIQ on Phones and Different Systems',
      'الصفحة متجاوبة مع Android وiPhone وWindows وmacOS، وتعمل عبر Chrome وSafari وFirefox وEdge. لا تحتاج إلى تثبيت تطبيق للتسجيل.':'The page is responsive on Android, iPhone, Windows and macOS, and works with Chrome, Safari, Firefox and Edge. You do not need to install an app to register.',
      'المستندات الخاصة لا تُجعل عامة، ولا يتم وضع مفاتيح الخدمة السرية في المتصفح.':'Private documents are not made public, and secret service keys are not placed in the browser.',
      'تحتاج خدمة في منطقتك؟':'Need a service in your area?','سجّل طلبك وسيتولى فريقنا المراجعة والمطابقة.':'Submit your request and our team will review and match it.','تقديم طلب':'Submit Request','اسأل الوكيل':'Ask the Assistant','واتساب':'WhatsApp'
    },
    fr: {},
    it: {},
    de: {}
  };

  // French, Italian and German are populated from the English interface labels plus
  // complete translations for the core public navigation and service experience.
  const COMMON = {
    fr: {
      Home:'Accueil',Services:'Services','Care or Membership Request':'Demande de soins ou d’adhésion','Care Guide':'Guide des soins','FAQ':'FAQ',Regions:'Régions','Care Providers':'Prestataires de soins','RAFIQ Assistant':'Assistant RAFIQ',Menu:'Menu',
      'RAFIQ | Rafiq':'RAFIQ | Rafiq','We reach the family with care and safety':'Nous accompagnons la famille avec attention et sécurité','Home-care and health-services platform in Lebanon':'Plateforme de soins à domicile et de services de santé au Liban',
      'Care or Membership Request':'Demande de soins ou d’adhésion','RAFIQ WhatsApp':'WhatsApp RAFIQ','📲 Install RAFIQ':'📲 Installer RAFIQ','Explore Services':'Découvrir les services',
      'How does RAFIQ help?':'Comment RAFIQ aide-t-il ?','A clear, simple interface for families and members, with quick access to the needed service.':'Une interface claire et simple pour les familles et les membres, avec un accès rapide au service recherché.',
      'Elderly Care':'Soins aux personnes âgées','Home Nursing':'Soins infirmiers à domicile','Physiotherapy':'Kinésithérapie','Supporting Health Services':'Services de santé complémentaires',
      'Care Details':'Détails des soins','Nursing Details':'Détails des soins infirmiers','Physiotherapy Details':'Détails de la kinésithérapie','View Service Network':'Voir le réseau de services',
      'Real care starts with the details':'Les vrais soins commencent par les détails','Coming Soon':'Bientôt disponible','⏳ Coming soon':'⏳ Bientôt disponible','🦷 Dentists':'🦷 Dentistes','🥗 Nutritionists':'🥗 Nutritionnistes','🗣️ Speech Specialists':'🗣️ Spécialistes de l’orthophonie','🩺 Medical Services and Equipment':'🩺 Services et équipements médicaux',
      'Services':'Services','More':'Plus','Start Your Request':'Commencer la demande','Contact via WhatsApp':'Contacter via WhatsApp',
      'RAFIQ Services':'Services RAFIQ','RAFIQ Message for Service Providers':'Message de RAFIQ aux prestataires','Upcoming Services':'Services à venir',
      'RAFIQ | Registration and Applications':'RAFIQ | Inscription et demandes','Important:':'Important :','Sign in or Create an Account':'Se connecter ou créer un compte','Email':'E-mail','Password':'Mot de passe','Sign in':'Se connecter','Create New Account':'Créer un compte',
      'Choose Request Type':'Choisir le type de demande','Caregiver':'Auxiliaire de vie','Nurse':'Infirmier / Infirmière','Physiotherapist':'Kinésithérapeute','Family':'Famille','Start Application':'Commencer la demande','Submit Care Request':'Déposer une demande de soins',
      'Application':'Demande','First name':'Prénom','Last name':'Nom de famille','Father’s name':'Nom du père','Date of birth':'Date de naissance','Phone number':'Numéro de téléphone','Address':'Adresse','Governorate':'Gouvernorat','District':'District','Locality':'Localité','Languages':'Langues','Specialty':'Spécialité','Experience':'Expérience','Additional notes':'Notes supplémentaires',
      'Requester name':'Nom du demandeur','Person needing care':'Personne ayant besoin de soins','Age':'Âge','Service type':'Type de service','Requested schedule':'Horaires souhaités','Submit Request for Review':'Envoyer la demande pour examen','Open RAFIQ Assistant':'Ouvrir l’assistant RAFIQ','Home Page':'Page d’accueil','Need a service in your area?':'Besoin d’un service dans votre région ?','Ask the Assistant':'Demander à l’assistant','WhatsApp':'WhatsApp'
    },
    it: {
      Home:'Home',Services:'Servizi','Care or Membership Request':'Richiesta di assistenza o adesione','Care Guide':'Guida all’assistenza','FAQ':'FAQ',Regions:'Regioni','Care Providers':'Operatori assistenziali','RAFIQ Assistant':'Assistente RAFIQ',Menu:'Menu',
      'RAFIQ | Rafiq':'RAFIQ | Rafiq','We reach the family with care and safety':'Siamo accanto alla famiglia con cura e sicurezza','Home-care and health-services platform in Lebanon':'Piattaforma di assistenza domiciliare e servizi sanitari in Libano',
      'RAFIQ WhatsApp':'WhatsApp RAFIQ','📲 Install RAFIQ':'📲 Installa RAFIQ','Explore Services':'Scopri i servizi','How does RAFIQ help?':'Come aiuta RAFIQ?','A clear, simple interface for families and members, with quick access to the needed service.':'Un’interfaccia chiara e semplice per famiglie e membri, con accesso rapido al servizio necessario.',
      'Elderly Care':'Assistenza agli anziani','Home Nursing':'Assistenza infermieristica domiciliare','Physiotherapy':'Fisioterapia','Supporting Health Services':'Servizi sanitari di supporto',
      'Care Details':'Dettagli dell’assistenza','Nursing Details':'Dettagli dell’assistenza infermieristica','Physiotherapy Details':'Dettagli della fisioterapia','View Service Network':'Visualizza la rete dei servizi',
      'Real care starts with the details':'La vera assistenza parte dai dettagli','Coming Soon':'In arrivo','⏳ Coming soon':'⏳ In arrivo','🦷 Dentists':'🦷 Dentisti','🥗 Nutritionists':'🥗 Nutrizionisti','🗣️ Speech Specialists':'🗣️ Logopedisti','🩺 Medical Services and Equipment':'🩺 Servizi e attrezzature mediche',
      'More':'Scopri di più','Start Your Request':'Inizia la richiesta','Contact via WhatsApp':'Contatta via WhatsApp','RAFIQ Services':'Servizi RAFIQ','RAFIQ Message for Service Providers':'Messaggio RAFIQ per gli operatori','Upcoming Services':'Servizi futuri',
      'RAFIQ | Registration and Applications':'RAFIQ | Registrazione e richieste','Important:':'Importante:','Sign in or Create an Account':'Accedi o crea un account','Email':'E-mail','Password':'Password','Sign in':'Accedi','Create New Account':'Crea nuovo account',
      'Choose Request Type':'Scegli il tipo di richiesta','Caregiver':'Assistente familiare','Nurse':'Infermiere / Infermiera','Physiotherapist':'Fisioterapista','Family':'Famiglia','Start Application':'Inizia la richiesta','Submit Care Request':'Invia richiesta di assistenza',
      'Application':'Richiesta','First name':'Nome','Last name':'Cognome','Father’s name':'Nome del padre','Date of birth':'Data di nascita','Phone number':'Numero di telefono','Address':'Indirizzo','Governorate':'Governatorato','District':'Distretto','Locality':'Località','Languages':'Lingue','Specialty':'Specializzazione','Experience':'Esperienza','Additional notes':'Note aggiuntive',
      'Requester name':'Nome del richiedente','Person needing care':'Persona che necessita assistenza','Age':'Età','Service type':'Tipo di servizio','Requested schedule':'Orario richiesto','Submit Request for Review':'Invia la richiesta per la revisione','Open RAFIQ Assistant':'Apri Assistente RAFIQ','Home Page':'Pagina principale','Need a service in your area?':'Hai bisogno di un servizio nella tua zona?','Ask the Assistant':'Chiedi all’assistente','WhatsApp':'WhatsApp'
    },
    de: {
      Home:'Startseite',Services:'Leistungen','Care or Membership Request':'Pflege- oder Beitrittsanfrage','Care Guide':'Pflegeleitfaden','FAQ':'FAQ',Regions:'Regionen','Care Providers':'Pflegeanbieter','RAFIQ Assistant':'RAFIQ-Assistent',Menu:'Menü',
      'RAFIQ | Rafiq':'RAFIQ | Rafiq','We reach the family with care and safety':'Wir begleiten Familien mit Fürsorge und Sicherheit','Home-care and health-services platform in Lebanon':'Plattform für häusliche Pflege und Gesundheitsleistungen im Libanon',
      'RAFIQ WhatsApp':'RAFIQ WhatsApp','📲 Install RAFIQ':'📲 RAFIQ installieren','Explore Services':'Leistungen entdecken','How does RAFIQ help?':'Wie hilft RAFIQ?','A clear, simple interface for families and members, with quick access to the needed service.':'Eine klare, einfache Oberfläche für Familien und Mitglieder mit schnellem Zugang zur benötigten Leistung.',
      'Elderly Care':'Seniorenbetreuung','Home Nursing':'Häusliche Krankenpflege','Physiotherapy':'Physiotherapie','Supporting Health Services':'Unterstützende Gesundheitsleistungen',
      'Care Details':'Details zur Betreuung','Nursing Details':'Details zur Krankenpflege','Physiotherapy Details':'Details zur Physiotherapie','View Service Network':'Servicenetz ansehen',
      'Real care starts with the details':'Gute Betreuung beginnt mit den Details','Coming Soon':'Demnächst','⏳ Coming soon':'⏳ Demnächst','🦷 Dentists':'🦷 Zahnärzte','🥗 Nutritionists':'🥗 Ernährungsfachkräfte','🗣️ Speech Specialists':'🗣️ Sprachtherapeuten','🩺 Medical Services and Equipment':'🩺 Medizinische Leistungen und Geräte',
      'More':'Mehr','Start Your Request':'Anfrage starten','Contact via WhatsApp':'Per WhatsApp kontaktieren','RAFIQ Services':'RAFIQ-Leistungen','RAFIQ Message for Service Providers':'RAFIQ-Nachricht für Dienstleister','Upcoming Services':'Künftige Leistungen',
      'RAFIQ | Registration and Applications':'RAFIQ | Registrierung und Anträge','Important:':'Wichtig:','Sign in or Create an Account':'Anmelden oder Konto erstellen','Email':'E-Mail','Password':'Passwort','Sign in':'Anmelden','Create New Account':'Neues Konto erstellen',
      'Choose Request Type':'Anfrageart auswählen','Caregiver':'Betreuungskraft','Nurse':'Pflegefachkraft','Physiotherapist':'Physiotherapeut/in','Family':'Familie','Start Application':'Antrag starten','Submit Care Request':'Pflegeanfrage senden',
      'Application':'Antrag','First name':'Vorname','Last name':'Nachname','Father’s name':'Name des Vaters','Date of birth':'Geburtsdatum','Phone number':'Telefonnummer','Address':'Adresse','Governorate':'Gouvernement','District':'Bezirk','Locality':'Ort','Languages':'Sprachen','Specialty':'Fachgebiet','Experience':'Erfahrung','Additional notes':'Zusätzliche Hinweise',
      'Requester name':'Name der anfragenden Person','Person needing care':'Pflegebedürftige Person','Age':'Alter','Service type':'Leistungsart','Requested schedule':'Gewünschter Zeitplan','Submit Request for Review':'Antrag zur Prüfung senden','Open RAFIQ Assistant':'RAFIQ-Assistent öffnen','Home Page':'Startseite','Need a service in your area?':'Benötigen Sie eine Leistung in Ihrer Region?','Ask the Assistant':'Assistent fragen','WhatsApp':'WhatsApp'
    }
  };

  const reverse = (lang) => {
    if (lang === 'ar') return null;
    const merged = Object.assign({}, T.en, COMMON[lang] || {});
    const map = {};
    Object.keys(merged).forEach(k => { map[k] = merged[k]; });
    return map;
  };

  function normalize(s) { return s.replace(/\s+/g, ' ').trim(); }

  function translateText(lang) {
    const map = reverse(lang);
    if (!map) return;
    const arabicToEnglish = T.en;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !normalize(n.nodeValue)) continue;
      const parent = n.parentElement;
      if (!parent || ['SCRIPT','STYLE','NOSCRIPT'].includes(parent.tagName)) continue;
      nodes.push(n);
    }
    nodes.forEach(node => {
      const raw = normalize(node.nodeValue);
      const english = arabicToEnglish[raw] || raw;
      const target = map[english] || english;
      if (target !== raw) node.nodeValue = node.nodeValue.replace(raw, target);
    });
  }

  function applyAttributes(lang) {
    const meta = {
      ar: { title: document.title, desc: document.querySelector('meta[name="description"]')?.content || '' },
      en: { title: 'RAFIQ | Home Care in Lebanon', desc: 'RAFIQ home-care and health services in Lebanon.' },
      fr: { title: 'RAFIQ | Soins à domicile au Liban', desc: 'Soins à domicile et services de santé RAFIQ au Liban.' },
      it: { title: 'RAFIQ | Assistenza domiciliare in Libano', desc: 'Assistenza domiciliare e servizi sanitari RAFIQ in Libano.' },
      de: { title: 'RAFIQ | Häusliche Pflege im Libanon', desc: 'RAFIQ häusliche Pflege und Gesundheitsleistungen im Libanon.' }
    };
    document.title = meta[lang].title;
    const d = document.querySelector('meta[name="description"]'); if (d) d.content = meta[lang].desc;
  }

  function buildSwitcher() {
    let box = document.querySelector('[data-rafig-language-switcher]');
    if (box) return box;
    box = document.createElement('div');
    box.setAttribute('data-rafig-language-switcher','');
    box.className = 'rafig-language-switcher';
    box.innerHTML = '<label class="rafig-language-label" for="rafig-language">🌐</label><select id="rafig-language" aria-label="Language"><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option><option value="it">Italiano</option><option value="de">Deutsch</option></select>';
    document.body.prepend(box);
    return box;
  }

  function apply(lang, persist) {
    if (!LANGS[lang]) lang = 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGS[lang].dir;
    document.documentElement.dataset.language = lang;
    if (persist) localStorage.setItem('rafiq-language', lang);
    applyAttributes(lang);
    if (lang !== 'ar') translateText(lang);
    const select = document.getElementById('rafig-language'); if (select) select.value = lang;
  }

  function init() {
    const box = buildSwitcher();
    if (!document.getElementById('rafig-language-style')) {
      const style = document.createElement('style'); style.id = 'rafig-language-style';
      style.textContent = '.rafig-language-switcher{position:fixed;top:10px;left:10px;z-index:9999;display:flex;align-items:center;gap:5px;padding:5px 7px;background:rgba(255,255,255,.96);border:1px solid #dbe9e2;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.10);direction:ltr}.rafig-language-switcher select{border:0;background:transparent;color:#087f58;font:700 13px Arial,Tahoma,sans-serif;outline:none;cursor:pointer;max-width:120px}.rafig-language-label{font-size:15px;line-height:1}.rafig-language-switcher select:focus{outline:2px solid #b88a22;outline-offset:2px}@media(max-width:480px){.rafig-language-switcher{top:6px;left:6px}.rafig-language-switcher select{max-width:105px;font-size:12px}}';
      document.head.appendChild(style);
    }
    const select = box.querySelector('select');
    select.addEventListener('change', () => {
      localStorage.setItem('rafiq-language', select.value);
      location.reload();
    });
    const saved = localStorage.getItem('rafiq-language') || 'ar';
    apply(saved, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
