# RAFIQ — Environment Variables Template

ضع هذه المتغيرات في إعدادات الاستضافة المناسبة. لا تضع قيمًا حقيقية أو أسرارًا في المستودع.

## Supabase — المشروع الحالي فقط
- `SUPABASE_URL` — https://qmuxaehrahfsnabyjens.supabase.co
- `SUPABASE_ANON_KEY` — المفتاح العام؛ استخدمه في الواجهة فقط مع سياسات RLS سليمة
- `SUPABASE_SERVICE_ROLE_KEY` — سري، للخادم فقط، ولا يوضع في ملفات الواجهة أو GitHub
- `SUPABASE_DB_URL` — رابط اتصال قاعدة البيانات؛ استخدم إعداد Pooling المناسب من لوحة Supabase ولا تنشر الرابط

## Telegram
- `TELEGRAM_BOT_TOKEN` — سري
- `TELEGRAM_WEBHOOK_SECRET` — سري
- `TELEGRAM_MANAGER_CHAT_IDS` — اختياري؛ عرّف معرّفات المدير في إعدادات الخادم فقط
- `TELEGRAM_CHANNEL_URL` — رابط قناة Telegram الرسمية الحالية؛ القيمة الافتراضية هي الرابط المعروف فقط
- `TELEGRAM_GROUP_URL` — اختياري؛ لا تضبطه حتى يتم تأكيد رابط المجموعة الإدارية الحالية
- `RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK=false` — يبقى متوقفًا إلى أن يُختبر البديل ويُعتمد التحويل
- `TELEGRAM_MARKETING_ENABLED=false`
- `TELEGRAM_BROADCAST_ON_START=false`
- `RAFIQ_TELEGRAM_SCHEDULED_ADS_APPROVED=false` — يتطلب موافقة منفصلة قبل الإعلانات المجدولة؛ لا تفعّله افتراضيًا

## WhatsApp / Kapso
- `KAPSO_API_KEY` — سري، أضفه فقط عند اعتماد التكامل
- `KAPSO_WEBHOOK_SECRET` — سري
- `WHATSAPP_PHONE_NUMBER_ID=1324609540731383`
- `WHATSAPP_BUSINESS_ACCOUNT_ID=1571101954509141`
- `KAPSO_ENABLED=false`
- `WHATSAPP_SENDING_ENABLED=false`
- `RAFIQ_WHATSAPP_AUTO_REPLY=false`
- `RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING=false`

## Meta
- `META_APP_ID=1087358919742996`
- `META_BUSINESS_ID=1092569476458172`
- `META_ACCESS_TOKEN` — سري، فقط عند الحاجة
- `META_APP_SECRET` — سري، فقط عند الحاجة
- `META_VERIFY_TOKEN` — سري، فقط عند الحاجة

## AI
- `GEMINI_API_KEY` — سري؛ يضاف فقط إلى Secrets في مساحة Hugging Face عند اختبار الوكيل.
- `RAFIQ_AGENT_PROVIDER=gemini` — الافتراضي في خادم RAFIQ؛ لا يحتاج إلى OpenAI API key.
- `RAFIQ_GEMINI_MODEL=gemini-3.6-flash` — نموذج Gemini المستقر الافتراضي؛ قد تختلف الإتاحة والحدود المجانية حسب حساب Google AI Studio.
- `RAFIQ_AGENT_MODEL` — مطلوب فقط إذا اختير `RAFIQ_AGENT_PROVIDER=openai` صراحةً، ويجب أن يكون اسم نموذج صالحًا لحسابك.

## Runtime
- `PLATFORM_URL` أو `RAFIQ_PUBLIC_BASE_URL` — عنوان HTTPS الفعلي للواجهة بعد نشرها؛ اتركه غير مضبوط إلى أن يتوفر عنوان موثّق. لن يعود الخادم إلى عنوان Render القديم.
- `RAFIQ_PUBLIC_SITE_URL` — أصل الواجهة العام فقط (مثل `https://<project>.pages.dev` دون مسار)، أضفه إلى Secrets الخاصة بـ Supabase Edge Functions بعد التأكد من عنوان Cloudflare النهائي؛ تستخدمه دالتا استقبال الطلبات ورفع المستندات في قائمة CORS المسموح بها.
- `PORT=7860`
- `HOST=0.0.0.0`
- `NODE_ENV=production`

## قواعد أمان
- ضع القيم السرية في إعدادات Secrets لدى مزود الاستضافة فقط.
- لا تضع أي مفتاح خدمة أو Token في ملفات `public/` أو السجلات أو محادثات الدعم.
- لا تستخدم مشروع Supabase القديم `nyrwfxqitxrspfvshejb`.
- وجود أسماء المتغيرات هنا لا يعني أن بيئة الاستضافة مهيأة أو أن التكامل يعمل.
- لا تفعّل إرسال WhatsApp أو تسجيل Webhook أو البث قبل اختبار صريح ومراجعة بشرية.
