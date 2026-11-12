from flask import Blueprint, jsonify, request

from app.core.store import alerts, households
from app.services.hazard_fetcher import fetch_earthquake_data, fetch_weather_data
from app.services.monitoring_service import run_monitoring_cycle
from app.scheduling.scheduler import scheduler_status, start_scheduler, stop_scheduler
from app.services.delivery_service import process_pending_alerts
from app.core.config import settings
from app.services.simulation_service import confirm_simulation_safe, get_simulation, start_simulation


admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.post("/simulation/earthquake")
def simulate_earthquake():
    """Start the real monitoring workflow with a controlled earthquake fixture."""
    payload = request.get_json(silent=True) or {}
    if not settings.simulation_password_matches(payload.get("password")):
        return jsonify({"status": "error", "message": "Invalid simulation password"}), 401

    job = start_simulation()
    return jsonify({"status": "accepted", **job}), 202


@admin_bp.get("/simulation/earthquake/<job_id>")
def simulation_status(job_id):
    job = get_simulation(job_id)
    if job is None:
        return jsonify({"status": "error", "message": "Simulation job not found"}), 404
    if job.get("status") == "failed":
        response = jsonify(job)
        response.status_code = 502
    else:
        if "after_event" in request.args:
            try:
                offset = max(0, int(request.args["after_event"]))
            except (TypeError, ValueError):
                return jsonify({"status": "error", "message": "after_event must be a non-negative integer"}), 400
            all_events = job.get("events", [])
            job["event_offset"] = min(offset, len(all_events))
            job["event_count"] = len(all_events)
            job["events"] = all_events[offset:]
            if job.get("status") != "completed":
                job.pop("result", None)
        response = jsonify(job)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@admin_bp.post("/simulation/earthquake/<job_id>/<household_id>/confirm-safe")
def confirm_simulation_household_safe(job_id, household_id):
    """Confirm a household alert created by this password-authorized simulation."""
    result = confirm_simulation_safe(job_id, household_id)
    if result is None:
        return jsonify({
            "status": "error",
            "message": "Simulation alert not found or no longer confirmable",
        }), 404
    return jsonify(result)


@admin_bp.get("/status")
def system_status():
    scheduler = scheduler_status()
    alert_count = sum(
        len(household_alerts)
        for household_alerts in alerts.values()
    )
    return jsonify({
        "status": "running",
        "households_registered": len(households),
        "monitoring": "scheduled" if scheduler["running"] else "manual",
        "persistence": households.mode,
        "alerts_tracked": alert_count,
        "scheduler": scheduler,
    })


@admin_bp.get("/hazards/earthquakes")
def current_earthquakes():
    try:
        return jsonify(fetch_earthquake_data())
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502


@admin_bp.post("/monitoring/run")
def run_monitoring():
    try:
        result = run_monitoring_cycle()
        return jsonify({"status": "completed", **result})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502


@admin_bp.post("/scheduler/start")
def start_monitoring_scheduler():
    try:
        started = start_scheduler()
        return jsonify({
            "status": "started" if started else "already_running",
            "scheduler": scheduler_status(),
        })
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400


@admin_bp.post("/scheduler/stop")
def stop_monitoring_scheduler():
    stopped = stop_scheduler()
    return jsonify({
        "status": "stopped" if stopped else "already_stopped",
        "scheduler": scheduler_status(),
    })


@admin_bp.post("/alerts/process")
def process_alert_delivery():
    try:
        return jsonify({"status": "completed", **process_pending_alerts()})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502


@admin_bp.get("/hazards/weather")
def current_weather():
    try:
        latitude = float(request.args["latitude"])
        longitude = float(request.args["longitude"])
    except (KeyError, TypeError, ValueError):
        return jsonify({
            "status": "error",
            "message": "latitude and longitude query parameters are required",
        }), 400

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return jsonify({
            "status": "error",
            "message": "latitude or longitude is outside the valid range",
        }), 400

    try:
        data = fetch_weather_data(latitude, longitude)
        return jsonify({
            "status": "ok",
            "latitude": latitude,
            "longitude": longitude,
            "weather": data,
        })
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 502
