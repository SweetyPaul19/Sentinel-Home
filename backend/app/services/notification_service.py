"""Notification boundary for Twilio SMS and voice delivery."""

import re
import json
from datetime import datetime, timezone

import requests
from twilio.rest import Client
from app.core.config import settings


class NotificationConfigurationError(RuntimeError):
    """Raised when delivery is requested without Twilio configuration."""


def _client() -> Client:
    if not settings.TWILIO_SID or not settings.TWILIO_TOKEN:
        raise NotificationConfigurationError("Twilio credentials are not configured")
    return Client(settings.TWILIO_SID, settings.TWILIO_TOKEN)


def _from_number() -> str:
    if not settings.TWILIO_FROM_NUMBER:
        raise NotificationConfigurationError("TWILIO_FROM_NUMBER is not configured")
    return settings.TWILIO_FROM_NUMBER


def _e164(value: str) -> str:
    """Normalize a user-entered international number for Twilio."""

    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if not digits:
        raise ValueError("A phone number is required")
    return f"+{digits}"


def send_sms(to: str, body: str):
    if not to or not body:
        raise ValueError("SMS recipient and body are required")
    return _client().messages.create(body=body, from_=_from_number(), to=_e164(to))


def send_whatsapp(to: str, body: str, *, template_variables: dict[str, str] | None = None):
    if not to or not body:
        raise ValueError("WhatsApp recipient and body are required")
    if not settings.TWILIO_WHATSAPP_FROM:
        raise NotificationConfigurationError("TWILIO_WHATSAPP_FROM is not configured")
    recipient = f"whatsapp:{_e164(to.removeprefix('whatsapp:'))}"
    sender = settings.TWILIO_WHATSAPP_FROM.strip()
    if not sender.startswith("whatsapp:"):
        sender = f"whatsapp:{sender}"
    payload = {"from_": sender, "to": recipient}
    content_sid = settings.TWILIO_WHATSAPP_CONTENT_SID.strip()
    if content_sid:
        payload["content_sid"] = content_sid
        variables = template_variables or {"1": body}
        variable_count = settings.TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT
        if template_variables is None and variable_count >= 2:
            variables["2"] = datetime.now(timezone.utc).strftime("%H:%M UTC")
        if variable_count > 0:
            payload["content_variables"] = json.dumps(variables)
        try:
            return _client().messages.create(**payload)
        except Exception as exc:
            # Twilio trial accounts may expose Sandbox sending while rejecting
            # Content API/template requests. Retry as a free-form Sandbox
            # message, which is valid during the user's 24-hour service window.
            error_text = str(exc).lower()
            template_errors = (
                "contentsid is invalid",
                "contentsid required",
                "content sid is invalid",
                "content api",
                "not available on a trial account",
            )
            status_code = getattr(exc, "status", None)
            if status_code != 400 and not any(item in error_text for item in template_errors):
                raise
            fallback = {"from_": sender, "to": recipient, "body": body}
            return _client().messages.create(**fallback)
    payload["body"] = body
    return _client().messages.create(**payload)


def send_telegram(chat_id: str, body: str):
    """Send a full, untemplated alert through the Telegram Bot API."""

    if not settings.TELEGRAM_BOT_TOKEN:
        raise NotificationConfigurationError("TELEGRAM_BOT_TOKEN is not configured")
    if not chat_id or not body:
        raise ValueError("Telegram chat ID and body are required")
    response = requests.post(
        f"{settings.TELEGRAM_API_BASE_URL}/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
        json={
            "chat_id": str(chat_id),
            "text": body[:4096],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=15,
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("ok") or not isinstance(result.get("result"), dict):
        raise RuntimeError(result.get("description", "Telegram rejected the message"))
    message_id = result["result"].get("message_id")
    return type("TelegramMessage", (), {
        "sid": str(message_id) if message_id is not None else None,
        "message_id": message_id,
    })()


def make_call(to: str, twiml_url: str):
    if not to or not twiml_url:
        raise ValueError("call recipient and TwiML URL are required")
    return _client().calls.create(url=twiml_url, to=_e164(to), from_=_from_number())


def voice_url_for(alert_id: str, household_id: str) -> str:
    """Return the configured TwiML URL for an alert voice call."""

    if settings.TWILIO_VOICE_URL:
        return settings.TWILIO_VOICE_URL
    if settings.PUBLIC_BACKEND_URL:
        return (
            f"{settings.PUBLIC_BACKEND_URL}/api/alerts/"
            f"{household_id}/{alert_id}/voice"
        )
    raise NotificationConfigurationError(
        "TWILIO_VOICE_URL or PUBLIC_BACKEND_URL is required for voice escalation"
    )
