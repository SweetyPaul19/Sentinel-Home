"""Scheduled hazard monitoring with durable, live execution telemetry."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib, json
from uuid import uuid4

from agent.graph.build_graph import run_agent_workflow
from app.core.store import households, monitoring_runs
from app.services.hazard_fetcher import fetch_earthquake_data, nearby_earthquakes

def _now(): return datetime.now(timezone.utc).isoformat()

def _event_signature(event):
    values={k:event.get(k) for k in ("id","magnitude","mmi","distance_km","hypocentral_distance_km")}
    return hashlib.sha256(json.dumps(values,sort_keys=True).encode()).hexdigest()

def _stage(stage,status,title,**kwargs):
    t=_now()
    event={"event_id":str(uuid4()),"stage":stage,"status":status,"title":title,
           "started_at":t,"completed_at":t,"duration_ms":0,"timestamp":t,
           "execution_mode":kwargs.pop("execution_mode","live"),"source":kwargs.pop("source","live_provider"),
           "retry_count":kwargs.pop("retry_count",0),"error":kwargs.pop("error",None)}
    event.update({k:v for k,v in kwargs.items() if v is not None})
    return event

def _save(run): monitoring_runs[f"{run['household_id']}:{run['cycle_id']}"]=deepcopy(run)

def _safe_payload(payload):
    result=dict(payload or {})
    if isinstance(result.get("features"),list): result["features"]=result["features"][:100]
    return result

def _skip(reason, mode):
    names=(("parameter_generation","Gemini parameter generation"),("parameter_validation","Parameter validation"),
           ("ml_inference","XGBoost damage prediction"),("urgency_scoring","Personalized urgency scoring"),
           ("rag_retrieval","RAG safety-guidance retrieval"),("guidance_generation","Gemini safety guidance"),
           ("alert_persistence","Alert persistence"),("notification","Telegram notification"))
    return [_stage(s,"skipped",f"{title} — {reason}",detail=f"Skipped because {reason}.",source="not_run",
                   upstream="nearby_normalization",execution_mode=mode) for s,title in names]

def run_monitoring_cycle(earthquake_data=None,event_callback=None,simulation=False,result_callback=None):
    started=_now(); cycle_id=str(uuid4()); mode="fixture" if simulation else "live"
    source_households=[deepcopy(h) for h in households.values()] if simulation else list(households.values())
    results=[]; payload=None
    def emit(event,household_id=None):
        event={**event,"cycle_id":cycle_id,"execution_mode":mode}
        if household_id: event["household_id"]=household_id
        if not simulation and household_id:
            existing=monitoring_runs.get(f"{household_id}:{cycle_id}") or {}
            partial={**existing,"trace":[*existing.get("trace",[]),event],
                     "current_stage":event.get("stage"),"last_event_at":event.get("completed_at") or event.get("timestamp")}
            _save(partial)
        if event_callback: event_callback(event)
        return event
    for h in source_households:
        if not simulation:
            _save({"id":f"{h['id']}:{cycle_id}","cycle_id":cycle_id,"household_id":h["id"],"source":"live",
                   "status":"running","started_at":started,"checked_at":None,"completed_at":None,
                   "duration_ms":None,"scheduler_timestamp":started,"trace":[],"workflow_errors":[],
                   "nearby_earthquake_count":None,"latest_earthquake":None,"current_stage":"hazard_api"})
    try:
        payload=earthquake_data if earthquake_data is not None else fetch_earthquake_data()
        hazard=_stage("hazard_api","completed","USGS hazard response received",
          request={"method":"GET","url":"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"},
          response={"type":payload.get("type"),"metadata":payload.get("metadata"),"feature_count":len(payload.get("features",[])),"payload":_safe_payload(payload)},
          provider="USGS Earthquake API",source="controlled_simulation_fixture" if simulation else "live_provider",
          upstream="scheduler",execution_mode=mode)
    except Exception as exc:
        payload={"features":[]}
        hazard=_stage("hazard_api","failed","USGS hazard request failed",error=str(exc),
          request={"method":"GET","provider":"USGS Earthquake API"},provider="USGS Earthquake API",upstream="scheduler")
    for h in source_households:
        hid=h["id"]; checked=_now(); trace=[emit(hazard,hid)]
        try:
            events=nearby_earthquakes(h["latitude"],h["longitude"],earthquake_data=payload)
            trace.append(emit(_stage("nearby_normalization","completed","Nearby earthquake filtering complete",
              request={"latitude":h["latitude"],"longitude":h["longitude"],"radius_km":500},
              response={"nearby_count":len(events),"events":events},provider="SentinelHome hazard normalizer",
              source="live_processing",upstream="hazard_api",execution_mode=mode),hid))
        except Exception as exc:
            events=[]; trace.append(emit(_stage("nearby_normalization","failed","Nearby earthquake filtering failed",
              error=str(exc),upstream="hazard_api"),hid))
        h.update({"last_monitored_at":checked,"nearby_earthquake_count":len(events),
                  "latest_earthquake":events[0] if events else None,"updated_at":checked})
        workflow=None; errors=[]
        if not events:
            trace.extend(emit(e,hid) for e in _skip("no nearby hazard detected",mode))
        else:
            earthquake=events[0]; event_id=earthquake.get("id"); signature=_event_signature(earthquake)
            should_assess=event_id and (h.get("last_assessed_event_id")!=event_id or h.get("last_assessment_signature")!=signature)
            if should_assess:
                callback=(lambda event,household_id=hid: emit(event,household_id)) if (event_callback or not simulation) else None
                workflow=run_agent_workflow(h,earthquake,callback,simulation=simulation)
                trace.extend(workflow.get("trace",[])); assessment=workflow.get("assessment"); errors=list(workflow.get("errors",[]))
                if assessment:
                    h["last_assessment"]={"hazard":"earthquake","event_id":event_id,"assessed_at":checked,**assessment}
                    h.update({"risk_score":assessment["urgency_score"],"risk_level":assessment["urgency_level"],
                              "last_hazard":"earthquake","last_hazard_at":checked})
                    if not errors or workflow.get("alert"):
                        h.update({"last_assessed_event_id":event_id,"last_assessment_signature":signature})
                h["last_workflow_errors"]=errors
                wf_h=workflow.get("household") or {}; alert=workflow.get("alert") or {}
                if wf_h.get("safe") is False or alert.get("status") in {"active","escalation_pending"}: h["safe"]=False
            else:
                trace.extend(emit(e,hid) for e in _skip("event already processed",mode))
                trace.append(emit(_stage("duplicate_guard","skipped","Existing event already processed",
                  response={"event_id":event_id},source="deduplication",upstream="nearby_normalization"),hid))
        if not simulation: households[hid]=h
        result={"household_id":hid,"nearby_earthquake_count":len(events),"latest_earthquake":events[0] if events else None,
                "assessment":workflow.get("assessment") if workflow else None,"advice":workflow.get("advice") if workflow else None,
                "alert":workflow.get("alert") if workflow else None,"confirmation_status":workflow.get("confirmation_status") if workflow else None,
                "escalation_required":bool(workflow.get("escalation_required")) if workflow else False,
                "workflow_errors":errors,"trace":trace}
        results.append(result)
        if result_callback:
            result_callback(deepcopy(result))
        if not simulation:
            completed=_now()
            status="failed" if any(e.get("status")=="failed" for e in trace) else "degraded" if errors or any(e.get("status")=="degraded" for e in trace) else "completed"
            duration=max(0,int((datetime.fromisoformat(completed)-datetime.fromisoformat(started)).total_seconds()*1000))
            _save({"id":f"{hid}:{cycle_id}","cycle_id":cycle_id,"household_id":hid,"source":"live","status":status,
                   "started_at":started,"checked_at":checked,"completed_at":completed,"duration_ms":duration,
                   "scheduler_timestamp":started,"trace":trace,"current_stage":None,"nearby_earthquake_count":len(events),
                   "latest_earthquake":events[0] if events else None,"assessment":result["assessment"],
                   "risk_score":(result["assessment"] or {}).get("urgency_score"),
                   "risk_level":(result["assessment"] or {}).get("urgency_level","unknown"),"workflow_errors":errors})
    return {"checked_at":_now(),"cycle_id":cycle_id,"earthquake_events_received":len((payload or {}).get("features",[])),
            "households_checked":len(results),"households_with_nearby_earthquakes":sum(r["nearby_earthquake_count"]>0 for r in results),
            "households":results}

