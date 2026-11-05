"""Asynchronous controlled-earthquake jobs for end-to-end demonstrations."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

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
            "events": [],
        }
    _executor.submit(_run, job_id, event_id)
    return get_simulation(job_id)


def get_simulation(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        # Return an isolated snapshot. The worker appends events while the
        # polling request is serializing its response; sharing the nested
        # events list can otherwise expose a partial/stale telemetry frame.
        return deepcopy(job) if job else None
