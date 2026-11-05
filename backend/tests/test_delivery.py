"""Tests for automatic alert delivery and timeout escalation."""

from datetime import datetime, timedelta, timezone
import json
import unittest
from unittest.mock import patch

from app.core.store import alerts, households
from app.services.alert_service import create_alert
from app.services.delivery_service import process_pending_alerts
from app.services import notification_service


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        households.clear()
        alerts.clear()
        households["delivery-household"] = {
            "id": "delivery-household",
            "emergency_contact": "+10000000000",
            "safe": False,
        }

    def tearDown(self):
        households.clear()
        alerts.clear()

    def test_pending_alert_is_sent_when_auto_delivery_enabled(self):
        create_alert(
            "delivery-household",
            hazard="earthquake",
            risk_score=0.8,
            message="Take shelter.",
            event_id="event-1",
        )
        fake_message = type("Message", (), {"sid": "SM-test"})()
        with patch("app.services.delivery_service.settings.AUTO_SEND_ALERTS", True), \
             patch("app.services.delivery_service.settings.TELEGRAM_BOT_TOKEN", ""), \
             patch("app.services.delivery_service.settings.TWILIO_WHATSAPP_FROM", ""), \
             patch("app.services.delivery_service.notification_service.send_sms", return_value=fake_message):
            result = process_pending_alerts()
        self.assertEqual(result["sms_sent"], 1)
        self.assertEqual(alerts["delivery-household"][0]["delivery_status"], "sent")

    def test_expired_alert_is_escalated_when_enabled(self):
        alert = create_alert(
            "delivery-household",
            hazard="earthquake",
            risk_score=0.8,
            message="Take shelter.",
            event_id="event-2",
        )
        alert["created_at"] = (
            datetime.now(timezone.utc) - timedelta(minutes=10)
        ).isoformat()
        alerts["delivery-household"] = [alert]
        fake_call = type("Call", (), {"sid": "CA-test"})()
        with patch("app.services.delivery_service.settings.AUTO_ESCALATE_ALERTS", True), \
             patch("app.services.delivery_service.settings.ALERT_CONFIRMATION_TIMEOUT_MINUTES", 1), \
             patch("app.services.delivery_service.notification_service.voice_url_for", return_value="https://example.test/voice"), \
             patch("app.services.delivery_service.notification_service.make_call", return_value=fake_call):
            result = process_pending_alerts()
        self.assertEqual(result["voice_escalations"], 1)
        self.assertEqual(alerts["delivery-household"][0]["status"], "escalated")

    def test_whatsapp_normalizes_formatted_international_number(self):
        captured = {}

        class Messages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return type("Message", (), {"sid": "SM-test"})()

        fake_client = type("Client", (), {"messages": Messages()})()
        with patch.object(notification_service, "_client", return_value=fake_client), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_FROM", "+17372508034"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_CONTENT_SID", "HX-template"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT", 1):
            notification_service.send_whatsapp(
                "+91 82503 16944", "Take shelter."
            )

        self.assertEqual(captured["to"], "whatsapp:+918250316944")
        self.assertEqual(captured["from_"], "whatsapp:+17372508034")
        self.assertEqual(captured["content_sid"], "HX-template")
        self.assertEqual(captured["content_variables"], '{"1": "Take shelter."}')

    def test_whatsapp_can_send_two_template_variables(self):
        captured = {}

        class Messages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return type("Message", (), {"sid": "MM-template"})()

        fake_client = type("Client", (), {"messages": Messages()})()
        with patch.object(notification_service, "_client", return_value=fake_client), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_FROM", "+17372508034"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_CONTENT_SID", "HX-template"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT", 2):
            notification_service.send_whatsapp("+918250316944", "Take shelter.")

        variables = json.loads(captured["content_variables"])
        self.assertEqual(variables["1"], "Take shelter.")
        self.assertRegex(variables["2"], r"^\d{2}:\d{2} UTC$")

    def test_whatsapp_omits_variables_for_no_variable_template(self):
        captured = {}

        class Messages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return type("Message", (), {"sid": "MM-no-vars"})()

        fake_client = type("Client", (), {"messages": Messages()})()
        with patch.object(notification_service, "_client", return_value=fake_client), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_FROM", "+17372508034"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_CONTENT_SID", "HX-template"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT", 0):
            notification_service.send_whatsapp("+918250316944", "Take shelter.")

        self.assertNotIn("content_variables", captured)

    def test_whatsapp_falls_back_to_free_form_when_template_is_rejected(self):
        requests = []

        class Messages:
            def create(self, **kwargs):
                requests.append(kwargs)
                if "content_sid" in kwargs:
                    raise RuntimeError("HTTP 400 error: The ContentSid is Invalid")
                return type("Message", (), {"sid": "MM-fallback"})()

        fake_client = type("Client", (), {"messages": Messages()})()
        with patch.object(notification_service, "_client", return_value=fake_client), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_FROM", "+17372508034"), \
             patch.object(notification_service.settings, "TWILIO_WHATSAPP_CONTENT_SID", "HX-template"):
            message = notification_service.send_whatsapp(
                "+91 82503 16944", "Take shelter."
            )

        self.assertEqual(message.sid, "MM-fallback")
        self.assertEqual(requests[-1]["body"], "Take shelter.")
        self.assertNotIn("content_sid", requests[-1])

    def test_telegram_sends_full_message(self):
        response = type(
            "Response", (), {
                "json": lambda self: {"ok": True, "result": {"message_id": 42}},
                "raise_for_status": lambda self: None,
            }
        )()
        with patch.object(notification_service.settings, "TELEGRAM_BOT_TOKEN", "bot-token"), \
             patch.object(notification_service.settings, "TELEGRAM_API_BASE_URL", "https://telegram.test"), \
             patch.object(notification_service.requests, "post", return_value=response) as post:
            message = notification_service.send_telegram(
                "12345", "SentinelHome safety guidance"
            )

        self.assertEqual(message.sid, "42")
        post.assert_called_once_with(
            "https://telegram.test/botbot-token/sendMessage",
            json={
                "chat_id": "12345",
                "text": "SentinelHome safety guidance",
                "disable_web_page_preview": True,
            },
            timeout=15,
        )
