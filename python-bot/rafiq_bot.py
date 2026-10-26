"""RAFIQ Telegram booking bot (polling mode).

Keep this process running on a trusted server. Never commit real credentials.
Do not use this polling bot with a token whose webhook is still active.
"""
from __future__ import annotations

import logging
import os
import re
from urllib.parse import urlencode

from dotenv import load_dotenv
from supabase import Client, create_client
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatType
from telegram.error import TelegramError
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
ADMIN_CHAT_ID_RAW = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()
WHATSAPP_NUMBER = re.sub(r"\D", "", os.getenv("WHATSAPP_BUSINESS_NUMBER", ""))
ADMIN_CHAT_ID: int | str = int(ADMIN_CHAT_ID_RAW) if ADMIN_CHAT_ID_RAW.lstrip("-").isdigit() else ADMIN_CHAT_ID_RAW

SERVICES = {
    "lab": "تحاليل مخبرية",
    "radiology": "تصوير طبي وأشعة",
    "physio": "علاج فيزيائي",
}
CHOOSING_SERVICE, GET_NAME, GET_CITY, CONFIRM_CONSENT = range(4)
MAX_FIELD_LENGTH = 120

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
)
logger = logging.getLogger("rafiq.telegram")


def supabase_client() -> Client:
    if not SUPABASE_URL.startswith("https://") or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def clean_field(value: str, label: str) -> str:
    cleaned = " ".join((value or "").strip().split())
    if not cleaned:
        raise ValueError(f"يرجى إدخال {label}.")
    if len(cleaned) > MAX_FIELD_LENGTH:
        raise ValueError(f"الحد الأقصى لحقل {label} هو {MAX_FIELD_LENGTH} حرفًا.")
    return cleaned


def service_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🩸 تحاليل مخبرية", callback_data="service:lab")],
        [InlineKeyboardButton("🩻 تصوير طبي وأشعة", callback_data="service:radiology")],
        [InlineKeyboardButton("💆 علاج فيزيائي", callback_data="service:physio")],
    ])


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    if update.message:
        await update.message.reply_text(
            "أهلًا بك في RAFIQ | رفيق 🇱🇧\n"
            "نساعدك في إرسال طلب تواصل لخدمة صحية. هذا البوت لا يقدم تشخيصًا أو نصيحة طبية.\n\n"
            "اختر الخدمة المطلوبة:",
            reply_markup=service_keyboard(),
        )
    return CHOOSING_SERVICE


async def choose_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        return ConversationHandler.END
    await query.answer()
    service_key = (query.data or "").partition(":")[2]
    if service_key not in SERVICES:
        await query.edit_message_text("اختيار غير صالح. أرسل /start للبدء مجددًا.")
        return ConversationHandler.END
    context.user_data["service_key"] = service_key
    context.user_data["service_label"] = SERVICES[service_key]
    await query.message.reply_text(
        f"الخدمة المختارة: {SERVICES[service_key]}\n\n"
        "أرسل الاسم الذي تريد تسجيل الطلب به (من دون معلومات طبية حساسة)."
    )
    return GET_NAME


async def get_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message or not update.message.text:
        return GET_NAME
    try:
        context.user_data["full_name"] = clean_field(update.message.text, "الاسم")
    except ValueError as exc:
        await update.message.reply_text(str(exc))
        return GET_NAME
    await update.message.reply_text("شكرًا. أرسل اسم المدينة أو المنطقة فقط.")
    return GET_CITY


async def get_city(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message or not update.message.text:
        return GET_CITY
    try:
        context.user_data["city"] = clean_field(update.message.text, "المدينة أو المنطقة")
    except ValueError as exc:
        await update.message.reply_text(str(exc))
        return GET_CITY

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("أوافق وأرسل الطلب", callback_data="consent:yes")],
        [InlineKeyboardButton("إلغاء", callback_data="consent:no")],
    ])
    await update.message.reply_text(
        "قبل الإرسال، نحتاج موافقتك على حفظ الاسم والمدينة ونوع الخدمة في قاعدة بيانات RAFIQ، "
        "وإرسال ملخص الطلب إلى فريق الإدارة على تيليغرام.\n"
        "لا ترسل تشخيصًا أو تقارير أو تفاصيل طبية حساسة. يمكنك الإلغاء في أي وقت قبل الإرسال.",
        reply_markup=keyboard,
    )
    return CONFIRM_CONSENT


async def confirm_consent(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if not query:
        return ConversationHandler.END
    await query.answer()
    if query.data == "consent:no":
        context.user_data.clear()
        await query.edit_message_text("تم إلغاء الطلب ولم يتم حفظ بياناته. يمكنك البدء عبر /start.")
        return ConversationHandler.END

    user = update.effective_user
    if not user:
        await query.edit_message_text("تعذر تحديد حساب تيليغرام. أرسل /start وحاول مجددًا.")
        return ConversationHandler.END

    try:
        client = supabase_client()
        payload = {
            "telegram_user_id": user.id,
            "telegram_username": user.username,
            "full_name": context.user_data["full_name"],
            "city": context.user_data["city"],
            "service_key": context.user_data["service_key"],
            "service_label": context.user_data["service_label"],
            "status": "new",
        }
        result = client.table("bookings").insert(payload).execute()
        row = result.data[0] if result.data else {}
        booking_id = row.get("id", "غير متاح")
    except Exception:
        logger.exception("Booking persistence failed; request was not confirmed")
        await query.edit_message_text(
            "عذرًا، تعذر حفظ الطلب بأمان الآن، لذلك لم نعتبره مسجّلًا. "
            "يرجى المحاولة لاحقًا أو التواصل مع إدارة رفيق."
        )
        return ConversationHandler.END

    service = context.user_data["service_label"]
    full_name = context.user_data["full_name"]
    city = context.user_data["city"]
    username = f"@{user.username}" if user.username else "غير متوفر"

    admin_text = (
        "📥 طلب RAFIQ جديد\n\n"
        f"رقم الطلب: {booking_id}\n"
        f"الخدمة: {service}\n"
        f"الاسم: {full_name}\n"
        f"المدينة/المنطقة: {city}\n"
        f"حساب تيليغرام: {username}\n"
        f"Telegram user ID: {user.id}\n"
        "الحالة: جديد — يحتاج مراجعة الإدارة"
    )
    admin_notified = False
    try:
        await context.bot.send_message(chat_id=ADMIN_CHAT_ID, text=admin_text)
        admin_notified = True
    except (TelegramError, ValueError, TypeError):
        logger.exception("Booking saved, but admin notification failed")

    wa_text = (
        "مرحبًا، أود متابعة طلب تواصل عبر منصة رفيق.\n"
        f"رقم الطلب: {booking_id}\n"
        f"الخدمة: {service}\n"
        f"الاسم: {full_name}\n"
        f"المدينة/المنطقة: {city}"
    )
    wa_url = f"https://wa.me/{WHATSAPP_NUMBER}?{urlencode({'text': wa_text})}" if WHATSAPP_NUMBER else None
    buttons = [[InlineKeyboardButton("فتح رسالة واتساب الجاهزة", url=wa_url)]] if wa_url else []
    await query.edit_message_text(
        "✅ تم حفظ طلبك في نظام رفيق بنجاح.\n"
        f"رقم الطلب: {booking_id}\n"
        f"الخدمة: {service}\n"
        f"المدينة/المنطقة: {city}\n\n"
        + ("تم إرسال إشعار إلى الإدارة.\n" if admin_notified else
           "تم حفظ الطلب، لكن تعذر إرسال إشعار الإدارة آليًا؛ ستتم مراجعته من قاعدة البيانات.\n")
        + ("يمكنك فتح رسالة واتساب ومراجعتها ثم الضغط على إرسال. لن تُرسل الرسالة تلقائيًا."
           if wa_url else "يمكنك التواصل مع الإدارة عبر قناة رفيق الرسمية."),
        reply_markup=InlineKeyboardMarkup(buttons) if buttons else None,
    )
    context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    if update.message:
        await update.message.reply_text("تم إلغاء العملية ولم يتم حفظ الطلب. اكتب /start للبدء مجددًا.")
    elif update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text("تم إلغاء العملية ولم يتم حفظ الطلب.")
    return ConversationHandler.END


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message:
        await update.message.reply_text(
            "استخدم /start لتسجيل طلب تواصل، و /cancel لإلغاء العملية.\n"
            "لا يقدّم البوت تشخيصًا طبيًا ولا يتعامل مع الحالات الطارئة."
        )


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Avoid logging user text or personal/health data.
    logger.error("Unhandled Telegram bot error", exc_info=context.error)


def validate_config() -> None:
    missing = []
    if not BOT_TOKEN or BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        missing.append("TELEGRAM_BOT_TOKEN")
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    if not ADMIN_CHAT_ID_RAW or "XXXXXXXX" in ADMIN_CHAT_ID_RAW:
        missing.append("TELEGRAM_ADMIN_CHAT_ID")
    if not WHATSAPP_NUMBER:
        logger.warning("WHATSAPP_BUSINESS_NUMBER is unset; WhatsApp button will be omitted")
    if missing:
        raise SystemExit("Missing required environment values: " + ", ".join(missing))


def main() -> None:
    validate_config()
    # Supabase credentials are checked at startup; never expose service-role key to clients.
    supabase_client()
    application = Application.builder().token(BOT_TOKEN).build()
    conversation = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            CHOOSING_SERVICE: [CallbackQueryHandler(choose_service, pattern=r"^service:(lab|radiology|physio)$")],
            GET_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_name)],
            GET_CITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_city)],
            CONFIRM_CONSENT: [CallbackQueryHandler(confirm_consent, pattern=r"^consent:(yes|no)$")],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
    )
    application.add_handler(conversation)
    application.add_handler(CommandHandler("help", help_command))
    application.add_error_handler(error_handler)
    logger.info("RAFIQ booking bot starting in polling mode")
    application.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=False)


if __name__ == "__main__":
    main()
