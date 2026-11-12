"""Asynchronous controlled-earthquake jobs for end-to-end demonstrations."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from app.core.store import alerts
from app.services.alert_service import is_simulation_alert
from app.services.monitoring_service import run_monitoring_cycle


_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sentinel-simulation")
_jobs: dict[str, dict] = {}
_lock = Lock()


def _fixture(event_id: str) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "id": event_id,
            "properties": {
                # This controlled fixture must exercise the alert branch for
                # ordinary registered households, not only severely damaged
                # buildings. It remains a plausible severe earthquake and is
                # still passed through the real ML/urgency workflow.
                "mag": 8.5,
                "mmi": 10.0,
                "place": "SentinelHome controlled earthquake simulation",
                "time": 1772178748744,
                "url": None,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [87.31192, 23.520445, 8.0],
            },
        }],
    }


def _run(job_id: str, event_id: str) -> None:
    with _lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()
    try:
        def record_event(event: dict) -> None:
            with _lock:
                _jobs[job_id].setdefault("events", []).append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **event,
                })

        record_event({
            "stage": "hazard_api",
            "status": "completed",
            "title": "Controlled earthquake fixture loaded",
            "request": {"source": "simulation_fixture", "event_id": event_id},
            "response": _fixture(event_id),
            "execution_mode": "fixture",
            "source": "controlled_simulation_fixture",
        })
        result = run_monitoring_cycle(
            earthquake_data=_fixture(event_id),
            event_callback=record_event,
            simulation=True,
        )
        with _lock:
            _jobs[job_id].update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "result": result,
            })
    except Exception as exc:
        with _lock:
            _jobs[job_id].update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(exc),
            })


def start_simulation() -> dict:
    job_id = str(uuid4())
    event_id = f"sentinelhome-simulation-{uuid4()}"
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "simulation_event_id": event_id,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "events": [],
        }
    _executor.submit(_run, job_id, event_id)
    return get_simulation(job_id)


def get_simulation(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def confirm_simulation_safe(job_id: str, household_id: str) -> dict | None:
    """Confirm only the simulation alert represented by this unguessable job."""
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.get("status") != "completed":
            return None
        result = job.get("result") or {}
        item = next(
            (row for row in result.get("households", [])
             if row.get("household_id") == household_id),
            None,
        )
        alert_info = (item or {}).get("alert") or {}
        alert_id = alert_info.get("id")
        alert = next(
            (row for row in alerts.get(household_id, []) if row.get("id") == alert_id),
            None,
        )
        if not item or not alert or not is_simulation_alert(alert):
            return None
        if alert.get("status") in {"active", "escalation_pending"}:
            alert.update({
                "status": "confirmed",
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
                "escalation_required": False,
            })
            alerts[household_id] = alerts.get(household_id, [])
        elif alert.get("status") != "confirmed":
            return None
        item["alert"] = dict(alert)
        item["confirmation_status"] = "confirmed"
        item["escalation_required"] = False
        event = {
            "event_id": f"confirmation-{uuid4()}",
            "stage": "confirmation",
            "status": "completed",
            "title": "Household confirmed safe",
            "detail": "Alert state updated; escalation prevented.",
            "execution_mode": "live",
            "source": "live_persistence",
            "response": {"escalation_prevented": True},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        job.setdefault("events", []).append(event)
        return {"status": "confirmed", "household_id": household_id}
