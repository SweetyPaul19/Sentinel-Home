"""Tests for signup Telegram linking and account-level alert delivery."""

from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from app.core.store import alerts, households, telegram_link_tokens, users
from app.main import app
from app.services.alert_service import create_alert
from app.services.delivery_service import send_alert_whatsapp


class TelegramLinkingTests(unittest.TestCase):
    def setUp(self):
        users.clear()
        households.clear()
        alerts.clear()
        telegram_link_tokens.clear()
        self.client = app.test_client()

    def tearDown(self):
        users.clear()
        households.clear()
        alerts.clear()
        telegram_link_tokens.clear()

    def _register(self):
        response = self.client.post(
            "/api/auth/register",
            json={"email": "telegram@example.com", "password": "password123"},
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()["user"]["id"]

    def test_start_link_requires_bot_username_and_returns_deep_link(self):
        self._register()
        with patch("app.api.telegram.settings.TELEGRAM_BOT_USERNAME", "sentinelhome_bot"):
            response = self.client.post("/api/telegram/link/start")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("https://t.me/sentinelhome_bot?start=", data["telegram_url"])
        self.assertEqual(len(telegram_link_tokens), 1)

    def test_webhook_links_chat_once_and_status_hides_chat_id(self):
        user_id = self._register()
        with patch("app.api.telegram.settings.TELEGRAM_BOT_USERNAME", "sentinelhome_bot"):
            started = self.client.post("/api/telegram/link/start").get_json()
        token = next(iter(telegram_link_tokens))

        linked = self.client.post("/api/telegram/webhook", json={
            "message": {
                "text": f"/start {token}",
                "chat": {"id": 987654321},
            },
        })
        self.assertEqual(linked.status_code, 200)
        self.assertEqual(users[user_id]["telegram_chat_id"], "987654321")
        self.assertTrue(self.client.get("/api/telegram/link/status").get_json()["telegram_connected"])
        self.assertNotIn("telegram_chat_id", self.client.get("/api/auth/me").get_json()["user"])

        reused = self.client.post("/api/telegram/webhook", json={
            "message": {"text": f"/start {token}", "chat": {"id": 111}},
        })
        self.assertEqual(reused.status_code, 400)

    def test_household_registration_requires_linked_telegram(self):
        self._register()
        payload = {
            "location": "Durgapur", "latitude": 23.5, "longitude": 87.3,
            "building_type": "Masonry", "household_size": 2,
            "emergency_contact": {"name": "User", "phone": "+919876543210"},
        }
        response = self.client.post("/api/households", json=payload)
        self.assertEqual(response.status_code, 428)
        self.assertEqual(response.get_json()["code"], "telegram_required")

    def test_delivery_uses_owner_chat_id_not_global_chat_id(self):
        user_id = self._register()
        users[user_id]["telegram_chat_id"] = "owner-chat"
        users[user_id]["telegram_linked_at"] = datetime.now(timezone.utc).isoformat()
        users[user_id] = users[user_id]
        households["owned"] = {
            "id": "owned", "owner_id": user_id, "safe": False,
            "primary_contact": {"name": "User", "phone": "+910000000001"},
        }
        alert = create_alert("owned", hazard="earthquake", risk_score=0.9, message="Move now.")
        fake_message = type("Message", (), {"sid": "telegram-1"})()
        with patch("app.services.delivery_service.settings.TELEGRAM_BOT_TOKEN", "bot-token"), \
             patch("app.services.delivery_service.settings.TELEGRAM_CHAT_ID", "wrong-global-id", create=True), \
             patch("app.services.delivery_service.notification_service.send_telegram", return_value=fake_message) as send:
            send_alert_whatsapp("owned", alert)
        send.assert_called_once_with("owner-chat", "🚨 SentinelHome earthquake alert\nRisk: high (0.900)\n\nSafety guidance:\nMove now.")

    def test_expired_link_is_rejected(self):
        user_id = self._register()
        telegram_link_tokens["expired"] = {
            "user_id": user_id,
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
            "consumed": False,
        }
        response = self.client.post("/api/telegram/webhook", json={
            "message": {"text": "/start expired", "chat": {"id": 123}},
        })
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
