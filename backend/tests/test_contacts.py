"""Tests for contact registration and multi-recipient delivery."""

from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from app.core.store import alerts, households, users
from app.main import app
from app.services.alert_service import create_alert
from app.services.delivery_service import process_pending_alerts


class ContactWorkflowTests(unittest.TestCase):
    def setUp(self):
        households.clear()
        alerts.clear()
        users.clear()

    def tearDown(self):
        households.clear()
        alerts.clear()
        users.clear()

    def test_registration_rejects_duplicate_contact_numbers(self):
        response = app.test_client().post("/api/households", json={
            "location": "Durgapur", "latitude": 23.5, "longitude": 87.3,
            "building_type": "Masonry", "household_size": 2,
            "emergency_contact": {"name": "User", "phone": "+919876543210"},
            "primary_contact": {"name": "User", "phone": "+919876543210"},
            "relatives": [{
                "name": "Parent", "relationship": "father",
                "phone": "+91 98765 43210", "receive_call": True,
            }],
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("contact phone numbers must be unique", response.get_json()["errors"])

    def test_simulation_requires_password(self):
        client = app.test_client()
        with patch("app.api.admin.settings.SIMULATION_PASSWORD", "private-test-password"):
            response = client.post("/api/admin/simulation/earthquake", json={"password": "wrong"})
        self.assertEqual(response.status_code, 401)

    def test_simulation_uses_fixed_fixture_after_password_check(self):
        with patch("app.api.admin.settings.SIMULATION_PASSWORD", "private-test-password"), \
             patch("app.api.admin.start_simulation", return_value={"job_id": "job-1", "status": "queued"}) as start_job:
            response = app.test_client().post(
                "/api/admin/simulation/earthquake",
                json={"password": "private-test-password"},
            )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.get_json()["job_id"], "job-1")
        start_job.assert_called_once()

    def test_initial_alert_uses_whatsapp_for_primary_only(self):
        households["contacts"] = {
            "id": "contacts", "safe": False,
            "primary_contact": {"id": "primary", "name": "User", "phone": "+910000000001"},
            "relatives": [{"id": "relative-1", "name": "Parent", "relationship": "father", "phone": "+910000000002", "receive_call": True}],
        }
        alert = create_alert("contacts", hazard="earthquake", risk_score=0.9, message="Move now.")
        fake_message = type("Message", (), {"sid": "WA-test"})()
        with patch("app.services.delivery_service.settings.AUTO_SEND_ALERTS", True), \
             patch("app.services.delivery_service.settings.TELEGRAM_BOT_TOKEN", ""), \
             patch("app.services.delivery_service.settings.TWILIO_WHATSAPP_FROM", "whatsapp:+14155552671"), \
             patch("app.services.delivery_service.notification_service.send_whatsapp", return_value=fake_message) as send:
            process_pending_alerts()
        send.assert_called_once_with(
            "+910000000001", "Move now.",
            template_variables={"1": "Risk high (0.900). Safety guidance: Move now.. Sources: Follow local authority guidance"},
        )
        stored_alert = alerts["contacts"][0]
        self.assertEqual(stored_alert["deliveries"][0]["channel"], "whatsapp")
        self.assertEqual(len(stored_alert["deliveries"]), 1)

    def test_initial_alert_uses_telegram_when_configured(self):
        users["telegram-user"] = {
            "id": "telegram-user", "email": "user@example.com",
            "telegram_chat_id": "12345",
        }
        households["telegram-contacts"] = {
            "id": "telegram-contacts", "owner_id": "telegram-user", "safe": False,
            "primary_contact": {"id": "primary", "name": "User", "phone": "+910000000001"},
        }
        alert = create_alert(
            "telegram-contacts", hazard="earthquake", risk_score=0.9,
            message="Move away from windows.",
        )
        fake_message = type("Message", (), {"sid": "42"})()
        with patch("app.services.delivery_service.settings.AUTO_SEND_ALERTS", True), \
             patch("app.services.delivery_service.settings.TELEGRAM_BOT_TOKEN", "bot-token"), \
             patch("app.services.delivery_service.notification_service.send_telegram", return_value=fake_message) as send:
            process_pending_alerts()

        send.assert_called_once()
        stored_alert = alerts["telegram-contacts"][0]
        self.assertEqual(stored_alert["delivery_channel"], "telegram")
        self.assertEqual(stored_alert["deliveries"][0]["provider_id"], "42")

    def test_escalation_calls_enabled_relatives_once(self):
        households["contacts"] = {
            "id": "contacts", "safe": False,
            "primary_contact": {"id": "primary", "name": "User", "phone": "+910000000001"},
            "relatives": [
                {"id": "relative-1", "name": "Parent", "relationship": "father", "phone": "+910000000002", "receive_call": True},
                {"id": "relative-2", "name": "Sibling", "relationship": "sister", "phone": "+910000000003", "receive_call": False},
            ],
        }
        alert = create_alert("contacts", hazard="earthquake", risk_score=0.9, message="Move now.")
        alert["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        alerts["contacts"] = [alert]
        fake_call = type("Call", (), {"sid": "CA-test"})()
        with patch("app.services.delivery_service.settings.AUTO_ESCALATE_ALERTS", True), \
             patch("app.services.delivery_service.settings.ALERT_CONFIRMATION_TIMEOUT_MINUTES", 1), \
             patch("app.services.delivery_service.notification_service.voice_url_for", return_value="https://example.test/voice"), \
             patch("app.services.delivery_service.notification_service.make_call", return_value=fake_call) as call:
            process_pending_alerts()
            process_pending_alerts()
        call.assert_called_once_with("+910000000002", "https://example.test/voice")
        self.assertEqual(alerts["contacts"][0]["escalation_reason"], "calls_initiated")
