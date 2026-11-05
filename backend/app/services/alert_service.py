"""Application service for creating and reading household alerts.

The monitoring or AIML layer can call this service later. Keeping alert state
here prevents those layers from reaching into Flask route internals.
"""

from datetime import datetime, timezone
from uuid import uuid4

from app.core.store import alerts, households


def create_alert(
    household_id: str,
    *,
    hazard: str,
    risk_score: float | None,
    message: str,
    sources: list[dict] | None = None,
    event_id: str | None = None,
    event_details: dict | None = None,
    simulation: bool = False,
) -> dict:
    household = households.get(household_id)
    if household is None:
        raise KeyError("Household not found")

    hazard = hazard.strip().lower() if isinstance(hazard, str) else ""
    if hazard not in {"earthquake", "flood", "cyclone", "general"}:
        raise ValueError("Unsupported hazard")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Alert message is required")

    if event_id:
        existing = next(
            (
                item for item in alerts.get(household_id, [])
                if item.get("event_id") == event_id
                and item.get("status") in {"active", "escalation_pending"}
            ),
            None,
        )
        if existing is not None:
            return existing

    now = datetime.now(timezone.utc).isoformat()
    numeric_score = float(risk_score) if risk_score is not None else None
    if numeric_score is not None and not 0 <= numeric_score <= 1:
        raise ValueError("risk_score must be between 0 and 1")
    risk_level = risk_level_for(numeric_score)
    alert = {
        "id": str(uuid4()),
        "household_id": household_id,
        "hazard": hazard,
        "risk_score": numeric_score,
        "risk_level": risk_level,
        "message": message.strip(),
        "sources": sources or [],
        "status": "active",
        "created_at": now,
        "confirmed_at": None,
        "event_id": event_id,
        "event_details": event_details or {},
        "simulation": bool(simulation),
        "delivery_status": "pending",
        "delivery_channel": None,
        "deliveries": [],
        "escalation_reason": None,
    }

    household_alerts = alerts.setdefault(household_id, [])
    household_alerts.insert(0, alert)
    alerts[household_id] = household_alerts
    if not simulation:
        household.update({
            "safe": False,
            "risk_score": numeric_score,
            "risk_level": risk_level,
            "last_hazard": hazard,
            "last_hazard_at": now,
            "updated_at": now,
        })
        households[household_id] = household
    return alert


def update_alert(household_id: str, alert_id: str, **changes) -> dict | None:
    """Update and persist one alert record."""

    household_alerts = alerts.get(household_id, [])
    for alert in household_alerts:
        if alert.get("id") == alert_id:
            alert.update(changes)
            alerts[household_id] = household_alerts
            return alert
    return None


def risk_level_for(risk_score: float | None) -> str:
    if risk_score is None:
        return "unknown"
    if risk_score >= 0.75:
        return "high"
    if risk_score >= 0.45:
        return "medium"
    return "low"


def get_household_alerts(household_id: str) -> list[dict]:
    return [alert for alert in alerts.get(household_id, []) if not is_simulation_alert(alert)]


def is_simulation_alert(alert: dict) -> bool:
    """Identify both new and legacy controlled-simulation alerts."""
    return bool(alert.get("simulation") or str(alert.get("event_id", "")).startswith("sentinelhome-simulation-"))


def get_alert(household_id: str, alert_id: str) -> dict | None:
    return next(
        (alert for alert in alerts.get(household_id, []) if alert["id"] == alert_id),
        None,
    )
