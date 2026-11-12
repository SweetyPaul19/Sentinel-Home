"""Alert delivery and timeout escalation orchestration."""

from __future__ import annotations

from html import escape
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.store import alerts, households, users
from app.services import notification_service
from app.services.alert_service import update_alert
from app.services.alert_service import is_simulation_alert
from app.services.contact_service import escalation_contacts, primary_contact


def _record_delivery(alert: dict, record: dict) -> list[dict]:
    deliveries = list(alert.get("deliveries") or [])
    deliveries.append(record)
    return deliveries


def _single_line(value: object, limit: int = 1200) -> str:
    """Make generated guidance safe for a WhatsApp template variable."""

    text = " ".join(str(value or "").split())
    return text[:limit].rstrip()


def _whatsapp_alert_body(alert: dict) -> str:
    """Flatten the complete alert for a one-variable WhatsApp template.

    WhatsApp template variables cannot contain line breaks.  The fixed text
    around ``{{1}}`` belongs to the approved template; this value carries the
    actual RAG/LLM advice and its audit sources.
    """

    score = alert.get("risk_score")
    score_text = f"{float(score):.3f}" if score is not None else "unknown"
    sources = alert.get("sources") or []
    source_text = "; ".join(
        f"{item.get('source', 'unknown source')} page {item.get('page', 'unknown')}"
        for item in sources if isinstance(item, dict)
    ) or "Follow local authority guidance"
    return _single_line(
        f"Risk {alert.get('risk_level', 'unknown')} ({score_text}). "
        f"Safety guidance: {alert.get('message', '')}. "
        f"Sources: {source_text}"
    )


def _whatsapp_template_variables(alert: dict) -> dict[str, str]:
    """Build variables for the configured approved Sandbox template."""

    variables = {"1": _whatsapp_alert_body(alert)}
    # The currently approved Sandbox appointment template has a second
    # placeholder. Keep it meaningful instead of allowing Twilio to render
    # its sample value. A future safety-specific template can use the same
    # variable contract or configure a single placeholder.
    if settings.TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT >= 2:
        variables["2"] = "SentinelHome earthquake safety alert"
    return variables


def _telegram_alert_body(alert: dict) -> str:
    """Render a clear, Telegram-HTML safety alert with verified event context."""

    hazard = str(alert.get("hazard") or "hazard").strip().replace("_", " ").title()
    level = str(alert.get("risk_level") or "unknown").strip().upper()
    score = alert.get("risk_score")
    try:
        score_text = f"{float(score):.2f} / 1.00" if score is not None else "Not available"
    except (TypeError, ValueError):
        score_text = "Not available"

    severity_icon = {"HIGH": "🔴", "MEDIUM": "🟠", "LOW": "🟢"}.get(level, "🟡")
    details = alert.get("event_details") or {}
    context = []
    if details.get("place"):
        context.append(f"📍 <b>Location:</b> {escape(str(details['place'])[:180])}")
    if details.get("magnitude") is not None:
        try:
            context.append(f"📈 <b>Magnitude:</b> {float(details['magnitude']):.1f}")
        except (TypeError, ValueError):
            pass
    if details.get("depth_km") is not None:
        try:
            context.append(f"↕️ <b>Depth:</b> {float(details['depth_km']):.1f} km")
        except (TypeError, ValueError):
            pass
    if details.get("distance_km") is not None:
        try:
            context.append(f"🏠 <b>Distance from home:</b> {float(details['distance_km']):.1f} km")
        except (TypeError, ValueError):
            pass
    event_time = details.get("time")
    if event_time is not None:
        try:
            occurred = datetime.fromtimestamp(float(event_time) / 1000, tz=timezone.utc)
            context.append(f"🕒 <b>Event time:</b> {occurred:%d %b %Y, %H:%M UTC}")
        except (TypeError, ValueError, OSError):
            pass

    advice = escape(str(alert.get("message") or "Follow local emergency instructions.").strip()[:2200])
    sections = [
        f"🚨 <b>SENTINELHOME | {escape(hazard.upper())} ALERT</b>",
        f"{severity_icon} <b>{escape(level)} RISK</b> · Urgency score: <b>{escape(score_text)}</b>",
    ]
    if context:
        sections.append("\n".join(context))
    sections.extend([
        f"\n<b>What to do now</b>\n{advice}",
        "If you are in the affected area, move to a safer place and follow local emergency-service instructions. Check in with everyone in your household.",
        "Open SentinelHome and select <b>“I’m safe”</b> once everyone has been accounted for.",
    ])

    sources = alert.get("sources") or []
    source_lines = []
    for item in sources[:3]:
        if not isinstance(item, dict):
            continue
        label = escape(str(item.get("source") or item.get("title") or "Safety guidance")[:120])
        page = item.get("page")
        source_lines.append(f"• {label}{f' · p. {escape(str(page))}' if page else ''}")
    if source_lines:
        sections.append("<b>Guidance sources</b>\n" + "\n".join(source_lines))

    sections.append("<i>SentinelHome safety notification · Verify conditions with local authorities.</i>")
    return "\n\n".join(sections)[:4096]


def send_alert_whatsapp(household_id: str, alert: dict) -> dict:
    household = households.get(household_id)
    if household is None:
        raise KeyError("Household not found")
    telegram_enabled = bool(settings.TELEGRAM_BOT_TOKEN)
    contact = primary_contact(household)
    if not telegram_enabled and not contact:
        raise ValueError("A primary contact is required for notification delivery")
    legacy_only = "primary_contact" not in household
    now = datetime.now(timezone.utc).isoformat()
    channel = (
        "telegram" if telegram_enabled
        else ("sms" if legacy_only and not settings.TWILIO_WHATSAPP_FROM else "whatsapp")
    )
    owner = users.get(household.get("owner_id")) if household.get("owner_id") else None
    telegram_chat_id = owner.get("telegram_chat_id") if owner else None
    recipient_id = owner.get("id") if owner else "telegram_unlinked"
    recipient_name = owner.get("email") if owner else "Telegram account not linked"
    if channel == "telegram" and not telegram_chat_id:
        now = datetime.now(timezone.utc).isoformat()
        skipped = {
            "recipient_id": recipient_id,
            "name": recipient_name,
            "channel": "telegram",
            "status": "telegram_not_linked",
            "error": "Household owner has not linked Telegram",
            "sent_at": now,
        }
        return update_alert(
            household_id,
            alert["id"],
            delivery_status="telegram_not_linked",
            delivery_channel="telegram",
            delivery_error=skipped["error"],
            deliveries=_record_delivery(alert, skipped),
        ) or alert
    try:
        if channel == "telegram":
            message = notification_service.send_telegram(
                telegram_chat_id, _telegram_alert_body(alert)
            )
        elif channel == "sms":
            message = notification_service.send_sms(contact["phone"], alert["message"])
        else:
            message = notification_service.send_whatsapp(
                contact["phone"], alert["message"],
                template_variables=_whatsapp_template_variables(alert),
            )
    except Exception as exc:
        failed = {
            "recipient_id": recipient_id if channel == "telegram" else contact.get("id", "primary"),
            "name": recipient_name if channel == "telegram" else contact.get("name"),
            "phone": contact.get("phone") if channel != "telegram" else None,
            "channel": channel, "status": "failed",
            "error": str(exc), "sent_at": now,
        }
        update_alert(
            household_id, alert["id"], delivery_status="failed",
            delivery_channel=channel, delivery_error=str(exc),
            deliveries=_record_delivery(alert, failed),
        )
        raise
    record = {
        "recipient_id": recipient_id if channel == "telegram" else contact.get("id", "primary"),
        "name": recipient_name if channel == "telegram" else contact.get("name"),
        "phone": contact.get("phone") if channel != "telegram" else None,
        "channel": channel, "status": "sent",
        "provider_id": getattr(message, "sid", None), "sent_at": now,
    }
    return update_alert(
        household_id, alert["id"], delivery_status="sent", delivery_channel=channel,
        sent_at=now, delivery_id=getattr(message, "sid", None),
        deliveries=_record_delivery(alert, record),
    ) or alert


def send_alert_sms(household_id: str, alert: dict) -> dict:
    """Send one alert by SMS and persist the delivery result."""

    household = households.get(household_id)
    if household is None:
        raise KeyError("Household not found")
    message = notification_service.send_sms(
        primary_contact(household)["phone"], alert.get("message")
    )
    return update_alert(
        household_id,
        alert["id"],
        delivery_status="sent",
        delivery_channel="sms",
        sent_at=datetime.now(timezone.utc).isoformat(),
        delivery_id=getattr(message, "sid", None),
    ) or alert


def escalate_alert_voice(household_id: str, alert: dict, twiml_url: str | None = None) -> dict:
    """Place an escalation call using the configured TwiML endpoint."""

    household = households.get(household_id)
    if household is None:
        raise KeyError("Household not found")
    contacts = escalation_contacts(household)
    attempted = {item.get("recipient_id") for item in alert.get("deliveries", []) if item.get("channel") == "voice"}
    if contacts:
        twiml_url = twiml_url or notification_service.voice_url_for(alert["id"], household_id)
    deliveries = list(alert.get("deliveries") or [])
    errors = []
    for contact in contacts:
        if contact.get("id") in attempted:
            continue
        now = datetime.now(timezone.utc).isoformat()
        try:
            call = notification_service.make_call(contact["phone"], twiml_url)
            deliveries.append({
                "recipient_id": contact["id"], "name": contact.get("name"),
                "relationship": contact.get("relationship"), "phone": contact["phone"],
                "channel": "voice", "status": "initiated",
                "provider_id": getattr(call, "sid", None), "sent_at": now,
            })
        except Exception as exc:
            errors.append(str(exc))
            deliveries.append({
                "recipient_id": contact["id"], "name": contact.get("name"),
                "relationship": contact.get("relationship"), "phone": contact["phone"],
                "channel": "voice", "status": "failed", "error": str(exc), "sent_at": now,
            })
    now = datetime.now(timezone.utc).isoformat()
    reason = "no_configured_relatives" if not contacts else ("delivery_failed" if errors else "calls_initiated")
    return update_alert(
        household_id, alert["id"], status="escalated", delivery_status="escalated",
        delivery_channel="voice", escalated_at=now,
        escalation_count=sum(1 for item in deliveries if item.get("channel") == "voice"),
        deliveries=deliveries, escalation_reason=reason,
        escalation_error="; ".join(errors) if errors else None,
    ) or alert


def process_pending_alerts() -> dict:
    """Send due WhatsApp alerts and escalate expired unanswered alerts."""

    now = datetime.now(timezone.utc)
    timeout = timedelta(minutes=settings.ALERT_CONFIRMATION_TIMEOUT_MINUTES)
    processed = 0
    sent = 0
    escalated = 0
    errors: list[dict] = []

    for household_id, household_alerts in list(_alert_items()):
        household = households.get(household_id)
        if household is None:
            continue
        for alert in household_alerts:
            if is_simulation_alert(alert):
                continue
            if alert.get("status") != "active":
                continue
            processed += 1

            if settings.AUTO_SEND_ALERTS and alert.get("delivery_status") == "pending":
                try:
                    send_alert_whatsapp(household_id, alert)
                    sent += 1
                except Exception as exc:
                    update_alert(
                        household_id, alert["id"],
                        delivery_status="failed",
                        delivery_error=str(exc),
                    )
                    errors.append({"alert_id": alert["id"], "stage": "whatsapp", "error": str(exc)})

            if household.get("safe") is True:
                continue
            created_at = alert.get("created_at")
            if not created_at:
                continue
            try:
                created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            except ValueError:
                continue
            if now - created < timeout:
                continue

            pending = update_alert(
                household_id,
                alert["id"],
                status="escalation_pending",
                escalation_required=True,
                timeout_at=now.isoformat(),
            ) or alert
            if settings.AUTO_ESCALATE_ALERTS:
                try:
                    escalate_alert_voice(household_id, pending)
                    escalated += 1
                except Exception as exc:
                    errors.append({"alert_id": alert["id"], "stage": "voice", "error": str(exc)})

    return {
        "active_alerts_checked": processed,
        "sms_sent": sent,
        "voice_escalations": escalated,
        "errors": errors,
    }


def _alert_items():
    for household_id in list(households):
        yield household_id, alerts.get(household_id, [])
