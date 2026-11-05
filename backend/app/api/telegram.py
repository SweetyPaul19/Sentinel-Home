"""Telegram account-linking endpoints."""

from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe

from flask import Blueprint, jsonify, request

from app.core.auth import current_user
from app.core.config import settings
from app.core.store import telegram_link_tokens, users


telegram_bp = Blueprint("telegram", __name__, url_prefix="/api/telegram")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_expiry(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@telegram_bp.post("/link/start")
def start_link():
    user = current_user()
    if user is None:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    if not settings.TELEGRAM_BOT_USERNAME:
        return jsonify({
            "status": "error",
            "message": "TELEGRAM_BOT_USERNAME is not configured",
        }), 503

    token = token_urlsafe(32)
    expires_at = _now() + timedelta(seconds=settings.TELEGRAM_LINK_TOKEN_TTL_SECONDS)
    telegram_link_tokens[token] = {
        "user_id": user["id"],
        "created_at": _now().isoformat(),
        "expires_at": expires_at.isoformat(),
        "consumed": False,
    }
    return jsonify({
        "status": "pending",
        "telegram_url": f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={token}",
        "expires_at": expires_at.isoformat(),
    })


@telegram_bp.get("/link/status")
def link_status():
    user = current_user()
    if user is None:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    user = users.get(user["id"]) or user
    response = jsonify({
        "status": "connected" if user.get("telegram_chat_id") else "pending",
        "telegram_connected": bool(user.get("telegram_chat_id")),
    })
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@telegram_bp.post("/webhook")
def telegram_webhook():
    update = request.get_json(silent=True) or {}
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    text = message.get("text") or ""
    if not chat.get("id") or not isinstance(text, str) or not text.startswith("/start"):
        return jsonify({"status": "ignored"})

    parts = text.split(maxsplit=1)
    token = parts[1].strip() if len(parts) == 2 else ""
    link = telegram_link_tokens.get(token) if token else None
    if not link or link.get("consumed"):
        return jsonify({"status": "error", "message": "Invalid or expired Telegram link"}), 400

    expires_at = _parse_expiry(link.get("expires_at"))
    if expires_at is None or expires_at <= _now():
        return jsonify({"status": "error", "message": "Telegram link has expired"}), 400

    user = users.get(link.get("user_id"))
    if user is None:
        return jsonify({"status": "error", "message": "Account not found"}), 400

    user["telegram_chat_id"] = str(chat["id"])
    user["telegram_linked_at"] = _now().isoformat()
    users[user["id"]] = user
    link["consumed"] = True
    link["consumed_at"] = _now().isoformat()
    telegram_link_tokens[token] = link
    try:
        from app.services.notification_service import send_telegram
        send_telegram(
            str(chat["id"]),
            "✅ Telegram connected to your SentinelHome account. You can return to signup.",
        )
    except Exception:
        # Linking is already persisted; a confirmation-message failure must
        # not make Telegram retry the update or undo the account link.
        pass
    return jsonify({"status": "linked"})
