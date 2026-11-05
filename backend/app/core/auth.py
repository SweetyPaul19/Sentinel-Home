"""Small MongoDB-backed session authentication boundary."""

from __future__ import annotations

from functools import wraps
from uuid import uuid4

from flask import g, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from app.core.store import users


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def public_user(user: dict | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "household_id": user.get("household_id"),
        "telegram_connected": bool(user.get("telegram_chat_id")),
    }


def create_user(email: str, password: str) -> dict:
    email = normalize_email(email)
    if "@" not in email or len(email) > 254:
        raise ValueError("A valid email address is required")
    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Password must contain at least 8 characters")
    if any(item.get("email") == email for item in users.values()):
        raise ValueError("An account with this email already exists")
    user = {
        "id": str(uuid4()),
        "email": email,
        "password_hash": generate_password_hash(password),
        "household_id": None,
    }
    users[user["id"]] = user
    return user


def authenticate(email: str, password: str) -> dict | None:
    email = normalize_email(email)
    user = next((item for item in users.values() if item.get("email") == email), None)
    if user and check_password_hash(user.get("password_hash", ""), password or ""):
        return user
    return None


def login_user(user: dict) -> None:
    session.clear()
    session["user_id"] = user["id"]


def current_user() -> dict | None:
    user_id = session.get("user_id")
    return users.get(user_id) if user_id else None


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"status": "error", "message": "Authentication required"}), 401
        g.current_user = user
        return view(*args, **kwargs)
    return wrapped


def owns_household(household_id: str, user: dict | None = None) -> bool:
    user = user or current_user()
    return bool(user and user.get("household_id") == household_id)
