"""Asynchronous controlled-earthquake jobs for end-to-end demonstrations."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from app.core.store import alerts, households, simulation_jobs
from app.services.alert_service import is_simulation_alert
from app.services.monitoring_service import run_monitoring_cycle


_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sentinel-simulation")
_jobs: dict[str, dict] = {}
_lock = Lock()
_MAX_RETAINED_COMPLETED_JOBS = 10


def _prune_jobs_locked() -> None:
    """Bound in-process simulation state so repeated demos cannot leak memory."""

    completed = [
        (job_id, job)
        for job_id, job in _jobs.items()
        if job.get("status") in {"completed", "failed"}
    ]
    completed.sort(key=lambda item: item[1].get("completed_at", ""))
    for job_id, _job in completed[:-_MAX_RETAINED_COMPLETED_JOBS]:
        _jobs.pop(job_id, None)
        try:
            del simulation_jobs[job_id]
        except KeyError:
            pass


def _persist_job_locked(job_id: str) -> None:
    job = _jobs.get(job_id)
    if job is not None:
        simulation_jobs[job_id] = job


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
        _persist_job_locked(job_id)
    try:
        def record_event(event: dict) -> None:
            with _lock:
                job = _jobs[job_id]
                household_id = event.get("household_id")
                if household_id:
                    job["current_household_id"] = household_id
                    household = households.get(household_id) or {}
                    job["current_household_name"] = household.get("household_name")
                job.setdefault("events", []).append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **event,
                })
                _persist_job_locked(job_id)

        def record_household_result(result: dict) -> None:
            with _lock:
                job = _jobs[job_id]
                partial = deepcopy(job.get("result") or {
                    "simulation_event_id": event_id,
                    "households_checked": 0,
                    "households_with_nearby_earthquakes": 0,
                    "households": [],
                })
                households = [
                    item for item in partial.get("households", [])
                    if item.get("household_id") != result.get("household_id")
                ]
                households.append(result)
                partial["households"] = households
                partial["households_checked"] = len(households)
                partial["households_with_nearby_earthquakes"] = sum(
                    item.get("nearby_earthquake_count", 0) > 0
                    for item in households
                )
                job["result"] = partial
                _persist_job_locked(job_id)

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
            result_callback=record_household_result,
        )
        with _lock:
            _jobs[job_id].update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "result": result,
            })
            _persist_job_locked(job_id)
    except Exception as exc:
        with _lock:
            _jobs[job_id].update({
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(exc),
            })
            _persist_job_locked(job_id)


def start_simulation() -> dict:
    job_id = str(uuid4())
    event_id = f"sentinelhome-simulation-{uuid4()}"
    with _lock:
        _prune_jobs_locked()
        active_job = next(
            (
                job for job in _jobs.values()
                if job.get("status") in {"queued", "running"}
            ),
            None,
        )
        if active_job is not None:
            return dict(active_job)
        _jobs[job_id] = {
            "job_id": job_id,
            "simulation_event_id": event_id,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "households_total": len(households),
            "events": [],
        }
        _persist_job_locked(job_id)
    _executor.submit(_run, job_id, event_id)
    return get_simulation(job_id)


def get_simulation(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            job = simulation_jobs.get(job_id)
        # Return an isolated snapshot while the worker appends telemetry.
        return deepcopy(job) if job else None


def confirm_simulation_safe(job_id: str, household_id: str) -> dict | None:
    """Confirm only the simulation alert represented by this unguessable job."""
    with _lock:
        job = _jobs.get(job_id) or simulation_jobs.get(job_id)
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
        _jobs[job_id] = job
        _persist_job_locked(job_id)
        return {"status": "confirmed", "household_id": household_id}
