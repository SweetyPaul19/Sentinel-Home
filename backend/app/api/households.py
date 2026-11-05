from datetime import datetime, timezone
from uuid import uuid4

from flask import Blueprint, jsonify, request

from app.core.auth import current_user, owns_household
from app.core.store import alerts, households, users
from app.core.store import monitoring_runs
from app.models.household import validate_household
from app.services.alert_service import is_simulation_alert, risk_level_for
from app.services.geocoding_service import geocode
from app.services.hazard_fetcher import fetch_weather_data, nearby_earthquakes
from app.services.contact_service import prepare_contacts
from app.scheduling.scheduler import scheduler_status


households_bp = Blueprint("households", __name__, url_prefix="/api/households")


@households_bp.get("/me")
def my_household():
    user = current_user()
    if not user:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    household_id = user.get("household_id")
    household = households.get(household_id) if household_id else None
    if household is None:
        return jsonify({"status": "error", "message": "No household is registered for this account"}), 404
    return jsonify({"status": "ok", "household": household})


@households_bp.get("/geocode")
def geocode_household_location():
    address = request.args.get("address", "").strip()
    if not address:
        return jsonify({
            "status": "error",
            "message": "address query parameter is required",
        }), 400
    if len(address) < 3 or len(address) > 250:
        return jsonify({
            "status": "error",
            "message": "address must contain between 3 and 250 characters",
        }), 400

    try:
        results = geocode(address)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502

    locations = []
    for result in results[:5]:
        try:
            locations.append({
                "display_name": result.get("display_name"),
                "latitude": float(result["lat"]),
                "longitude": float(result["lon"]),
                "osm_type": result.get("osm_type"),
                "osm_id": result.get("osm_id"),
            })
        except (KeyError, TypeError, ValueError):
            continue

    return jsonify({
        "status": "ok",
        "query": address,
        "count": len(locations),
        "locations": locations,
    })


@households_bp.get("", strict_slashes=False)
def list_households():
    return jsonify({
        "status": "ok",
        "count": len(households),
        "households": list(households.values()),
    })


@households_bp.post("", strict_slashes=False)
def register_household():
    payload = request.get_json(silent=True) or {}
    errors = validate_household(payload)
    if errors:
        return jsonify({"status": "error", "errors": errors}), 400
    if current_user() is None:
        return jsonify({"status": "error", "message": "Create or sign in to an account before registering a household"}), 401
    if not current_user().get("telegram_chat_id"):
        return jsonify({
            "status": "error",
            "message": "Link Telegram before registering a household",
            "code": "telegram_required",
        }), 428

    household_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    household = {
        "id": household_id,
        **prepare_contacts(payload),
        "latitude": float(payload["latitude"]),
        "longitude": float(payload["longitude"]),
        "household_size": int(payload["household_size"]),
        "vulnerable_members": payload.get("vulnerable_members", []),
        "safe": True,
        "risk_score": None,
        "risk_level": "unknown",
        "last_hazard": None,
        "last_hazard_at": None,
        "created_at": now,
        "updated_at": now,
    }
    user = current_user()
    if user:
        if user.get("household_id"):
            return jsonify({"status": "error", "message": "This account already has a primary household"}), 409
        household["owner_id"] = user["id"]
        user["household_id"] = household_id
        users[user["id"]] = user
    households[household_id] = household
    return jsonify({"status": "registered", "household": household}), 201


@households_bp.get("/<household_id>")
def get_household(household_id):
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404
    user = current_user()
    if household.get("owner_id") and not user:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    if user and household.get("owner_id") and not owns_household(household_id, user):
        return jsonify({"status": "error", "message": "Household access denied"}), 403
    return jsonify({"status": "ok", "household": household})


@households_bp.get("/<household_id>/status")
def get_household_status(household_id):
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404
    user = current_user()
    if household.get("owner_id") and not user:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    if user and household.get("owner_id") and not owns_household(household_id, user):
        return jsonify({"status": "error", "message": "Household access denied"}), 403

    # Controlled simulations are visible only in the internal simulation
    # console; they must never change the user's production dashboard state.
    household_alerts = [alert for alert in alerts.get(household_id, []) if not is_simulation_alert(alert)]
    active_alerts = [alert for alert in household_alerts if alert["status"] == "active"]
    last_assessment = household.get("last_assessment")
    if isinstance(last_assessment, dict) and is_simulation_alert({"event_id": last_assessment.get("event_id")}):
        # Hide legacy simulation state from the production dashboard too.
        last_assessment = None
        production_risk_score = None
        production_risk_level = "unknown"
        production_last_hazard = None
        production_last_hazard_at = None
        production_monitored_at = None
        production_nearby_count = 0
        production_latest_earthquake = None
    else:
        production_risk_score = household.get("risk_score")
        production_risk_level = household.get("risk_level", "unknown")
        production_last_hazard = household.get("last_hazard")
        production_last_hazard_at = household.get("last_hazard_at")
        production_monitored_at = household.get("last_monitored_at")
        production_nearby_count = household.get("nearby_earthquake_count", 0)
        production_latest_earthquake = household.get("latest_earthquake")
    if active_alerts:
        monitoring_state = "alert_active"
    elif household["safe"]:
        monitoring_state = "monitoring"
    else:
        monitoring_state = "awaiting_confirmation"

    recent_checks_full = sorted(
        [
            run for run in monitoring_runs.values()
            if run.get("household_id") == household_id and run.get("source") == "live"
        ],
        key=lambda run: run.get("checked_at", ""),
        reverse=True,
    )[:5]
    recent_checks = [
        {key: value for key, value in run.items() if key != "trace"}
        for run in recent_checks_full
    ]
    scheduler = scheduler_status()
    latest_check = recent_checks[0] if recent_checks else None
    latest_check_full = recent_checks_full[0] if recent_checks_full else None
    running_checks = [
        run for run in monitoring_runs.values()
        if run.get("household_id") == household_id
        and run.get("source") == "live"
        and run.get("status") == "running"
    ]
    current_cycle = max(running_checks, key=lambda run: run.get("started_at", "")) if running_checks else None
    hazard_response = None
    if latest_check_full:
        hazard_events = [e for e in latest_check_full.get("trace", []) if e.get("stage") == "hazard_api"]
        hazard_response = hazard_events[-1] if hazard_events else None

    return jsonify({
        "status": "ok",
        "household_id": household_id,
        "monitoring_state": monitoring_state,
        "safe": True if last_assessment is None and not active_alerts else household["safe"],
        "risk_score": production_risk_score,
        "risk_level": production_risk_level,
        "last_hazard": production_last_hazard,
        "last_hazard_at": production_last_hazard_at,
        "last_assessment": last_assessment,
        "last_monitored_at": production_monitored_at,
        "nearby_earthquake_count": production_nearby_count,
        "latest_earthquake": production_latest_earthquake,
        "active_alerts": active_alerts,
        "recent_alerts": household_alerts[:5],
        "scheduler": scheduler,
        "last_check": latest_check,
        "recent_checks": recent_checks,
        "current_cycle_state": (
            "running" if current_cycle else "degraded" if latest_check and latest_check.get("status") == "degraded"
            else "completed" if latest_check else "no_history"
        ),
        "current_cycle": current_cycle,
        "hazard_response": hazard_response,
    })


def _owned_household_or_error(household_id):
    household = households.get(household_id)
    if household is None:
        return None, (jsonify({"status": "error", "message": "Household not found"}), 404)
    user = current_user()
    if household.get("owner_id") and not user:
        return None, (jsonify({"status": "error", "message": "Authentication required"}), 401)
    if user and household.get("owner_id") and not owns_household(household_id, user):
        return None, (jsonify({"status": "error", "message": "Household access denied"}), 403)
    return household, None


@households_bp.get("/<household_id>/monitoring/latest")
def get_latest_monitoring(household_id):
    household, error = _owned_household_or_error(household_id)
    if error:
        return error
    runs = sorted(
        [run for run in monitoring_runs.values()
         if run.get("household_id") == household_id and run.get("source") == "live"],
        key=lambda run: run.get("started_at", ""), reverse=True,
    )
    return jsonify({"status": "ok", "household_id": household_id, "run": runs[0] if runs else None})


@households_bp.get("/<household_id>/monitoring/runs")
def get_monitoring_runs(household_id):
    household, error = _owned_household_or_error(household_id)
    if error:
        return error
    try:
        limit = min(max(int(request.args.get("limit", 5)), 1), 20)
    except ValueError:
        limit = 5
    runs = sorted(
        [run for run in monitoring_runs.values()
         if run.get("household_id") == household_id and run.get("source") == "live"],
        key=lambda run: run.get("started_at", ""), reverse=True,
    )[:limit]
    return jsonify({"status": "ok", "household_id": household_id, "runs": runs})


@households_bp.post("/<household_id>/assessment")
def record_household_assessment(household_id):
    """Store an ML assessment without creating or closing an alert."""
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"status": "error", "message": "request body must be a JSON object"}), 400
    hazard = payload.get("hazard")
    if not isinstance(hazard, str) or not hazard.strip():
        return jsonify({"status": "error", "message": "hazard is required"}), 400

    hazard = hazard.strip().lower()
    if hazard not in {"earthquake", "flood", "cyclone", "general"}:
        return jsonify({
            "status": "error",
            "message": "hazard must be earthquake, flood, cyclone, or general",
        }), 400

    try:
        risk_score = float(payload["risk_score"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"status": "error", "message": "risk_score must be numeric"}), 400

    if not 0 <= risk_score <= 1:
        return jsonify({
            "status": "error",
            "message": "risk_score must be between 0 and 1",
        }), 400

    assessed_at = datetime.now(timezone.utc).isoformat()
    risk_level = risk_level_for(risk_score)
    assessment = {
        "hazard": hazard,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "assessed_at": assessed_at,
        "source": payload.get("source", "ml"),
    }
    household.update({
        "risk_score": risk_score,
        "risk_level": risk_level,
        "last_hazard": hazard,
        "last_hazard_at": assessed_at,
        "last_assessment": assessment,
        "updated_at": assessed_at,
    })
    households[household_id] = household

    return jsonify({
        "status": "recorded",
        "household_id": household_id,
        "assessment": assessment,
        "alert_required": risk_level == "high",
    })


@households_bp.get("/<household_id>/hazards/earthquakes")
def get_household_earthquakes(household_id):
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404

    try:
        radius_km = float(request.args.get("radius_km", 500))
        if radius_km <= 0 or radius_km > 20000:
            raise ValueError
        events = nearby_earthquakes(
            household["latitude"],
            household["longitude"],
            radius_km=radius_km,
        )
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "radius_km must be between 0 and 20000",
        }), 400
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502

    return jsonify({
        "status": "ok",
        "household_id": household_id,
        "radius_km": radius_km,
        "count": len(events),
        "earthquakes": events,
    })


@households_bp.get("/<household_id>/hazards/weather")
def get_household_weather(household_id):
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404

    try:
        weather = fetch_weather_data(
            household["latitude"],
            household["longitude"],
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502

    return jsonify({
        "status": "ok",
        "household_id": household_id,
        "latitude": household["latitude"],
        "longitude": household["longitude"],
        "weather": weather,
    })


@households_bp.patch("/<household_id>")
def update_household(household_id):
    household = households.get(household_id)
    if household is None:
        return jsonify({"status": "error", "message": "Household not found"}), 404
    user = current_user()
    if household.get("owner_id") and not user:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    if user and household.get("owner_id") and not owns_household(household_id, user):
        return jsonify({"status": "error", "message": "Household access denied"}), 403

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"status": "error", "message": "request body must be a JSON object"}), 400
    candidate = {key: value for key, value in payload.items() if key != "id"}
    errors = validate_household(candidate, partial=True)
    if errors:
        return jsonify({"status": "error", "errors": errors}), 400

    household.update(candidate)
    household.update(prepare_contacts(candidate))
    if "latitude" in candidate:
        household["latitude"] = float(candidate["latitude"])
    if "longitude" in candidate:
        household["longitude"] = float(candidate["longitude"])
    if "household_size" in candidate:
        household["household_size"] = int(candidate["household_size"])
    household["updated_at"] = datetime.now(timezone.utc).isoformat()
    households[household_id] = household

    return jsonify({"status": "updated", "household": household})
