# RAFIQ — Environment Variables Template

ضع هذه المتغيرات في إعدادات الاستضافة المناسبة. لا تضع قيمًا حقيقية أو أسرارًا في المستودع.

## Supabase — المشروع الحالي فقط
- `SUPABASE_URL` — https://qmuxaehrahfsnabyjens.supabase.co
- `SUPABASE_ANON_KEY` — المفتاح العام؛ للواجهة فقط مع سياسات RLS سليمة.
- `SUPABASE_SERVICE_ROLE_KEY` — سري للخادم فقط. لا يوضع في الواجهة أو GitHub.
- `SUPABASE_DB_URL` — رابط اتصال قاعدة البيانات؛ لا تنشره.

## Telegram — البوت الحالي
- `TELEGRAM_BOT_TOKEN` — سر البوت الحالي `@RAFIQ_Care_Bot`.
- `TELEGRAM_WEBHOOK_SECRET` — سر التحقق من Telegram، بطول 32–256 حرفاً من الأحرف التي يدعمها Telegram.
- `TELEGRAM_MANAGER_CHAT_IDS` — غير مطلوب لمسار دليل المراكز الحالي؛ لا تضفه إلا عند اعتماد ميزة إشعار إداري جديدة.
- رابط الدالة الحالي: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook`.
- لا تعِد تسجيل Webhook قبل نشر نسخة الدالة والتحقق من عملها وتأكيد `getWebhookInfo`.
- لا تسجل Webhook إلى Cloudflare D1 أو Render.

## WhatsApp — manual only
- لا حاجة إلى مفاتيح API أو إعدادات Meta/Kapso.
- استخدم الرقم والقناة الموجودين من تطبيق WhatsApp يدوياً فقط.
- لا تفعّل Cloud API أو Webhooks أو الإرسال الآلي.

## AI
- `CLOUDFLARE_ACCOUNT_ID` و`CLOUDFLARE_API_TOKEN` اختياريان لوظيفة Workers AI في Telegram فقط؛ استخدم أقل صلاحية لازمة ولا تسجل القيم.
- `CLOUDFLARE_AI_MODEL` اختياري؛ القيمة الافتراضية في الشيفرة هي `@cf/meta/llama-3.1-8b-instruct`.

## Runtime
- `PLATFORM_URL` أو `RAFIQ_PUBLIC_BASE_URL` — عنوان HTTPS الفعلي للواجهة بعد نشرها. لا تستخدم Render.
- `RAFIQ_PUBLIC_SITE_URL` — أصل الواجهة العام عند الحاجة لقائمة CORS الخاصة بخدمة CV ورفع ملفاتها.
- `PORT=7860`, `HOST=0.0.0.0`, `NODE_ENV=production`.

## قواعد أمان
- الأسرار تبقى في إعدادات Secrets لدى مزود الاستضافة فقط.
- لا تضع مفاتيح أو Tokens في ملفات `public/` أو السجلات أو محادثات الدعم.
- لا تستخدم مشروع Supabase القديم `nyrwfxqitxrspfvshejb`.
- لا تنشئ مشروع Supabase جديداً أو قاعدة D1 بديلة.
- وجود أسماء المتغيرات هنا لا يعني أن البيئة مهيأة أو أن التكامل يعمل.
