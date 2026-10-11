"""FastAPI web and REST API application for the Water Tanker Dispatch System."""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from pathlib import Path

from src.core.cedar_auth import cedar_engine
from src.core.opensearch_client import opensearch_service
from src.core.priority_engine import priority_engine
from src.core.mock_data import SEED_WARDS, SEED_WEATHER
from src.agent.strands_agent import dispatch_agent
from src.agent.tools import OPERATIONAL_REQUESTS, OPERATIONAL_TANKERS
from src.models.request import TankerRequest, RequestStatus

app = FastAPI(
    title="Heatwave-Aware Water Tanker Routing Agent",
    description="Intelligent, explainable water tanker dispatching governed by Amazon Cedar policies and AWS Strands.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed OpenSearch initial records
for req in OPERATIONAL_REQUESTS:
    opensearch_service.index_request(req.model_dump())

# --- Request / Response Models ---
class CedarAuthCheckRequest(BaseModel):
    role: str
    user_id: str
    action: str
    resource_id: str = "system"
    resource_ward: str = ""
    override_reason: str = ""

class OverridePriorityRequest(BaseModel):
    officer_id: str
    officer_ward: str
    request_id: str
    target_ward_id: str
    override_priority_score: float
    override_reason: str

class ResidentSubmitRequest(BaseModel):
    resident_id: str
    area_name: str
    ward_id: str
    household_count: int
    current_tank_level_pct: float
    required_liters: int
    days_since_last_delivery: float
    urgency_reason: str

# --- Endpoints ---

@app.post("/api/cedar/check")
def check_cedar_permission(req: CedarAuthCheckRequest):
    """Evaluates an action against Amazon Cedar policies."""
    context = {
        "officer_ward": req.resource_ward,
        "override_reason": req.override_reason
    }
    allowed, explanation = cedar_engine.authorize(
        principal_role=req.role,
        principal_id=req.user_id,
        action=req.action,
        resource_id=req.resource_id,
        resource_ward=req.resource_ward,
        context=context
    )
    return {"allowed": allowed, "explanation": explanation}

@app.get("/api/state")
def get_operational_state():
    """Returns current active requests, weather, wards, and fleet status."""
    return {
        "wards": {k: v.model_dump() for k, v in SEED_WARDS.items()},
        "weather": {k: v.model_dump() for k, v in SEED_WEATHER.items()},
        "requests": [r.model_dump() for r in OPERATIONAL_REQUESTS],
        "tankers": [t.model_dump() for t in OPERATIONAL_TANKERS]
    }

@app.post("/api/requests/submit")
def submit_request(req_data: ResidentSubmitRequest):
    """Resident submits a new water tanker request."""
    allowed, explanation = cedar_engine.authorize(
        principal_role="Resident",
        principal_id=req_data.resident_id,
        action="SubmitRequest",
        resource_id="req-new",
        resource_ward=req_data.ward_id
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=explanation)

    ward_info = SEED_WARDS.get(req_data.ward_id)
    coords = ward_info.center_coords if ward_info else (19.0760, 72.8777)

    new_req = TankerRequest(
        request_id=f"REQ-{len(OPERATIONAL_REQUESTS) + 1:03d}",
        resident_id=req_data.resident_id,
        area_name=req_data.area_name,
        ward_id=req_data.ward_id,
        coords=coords,
        household_count=req_data.household_count,
        current_tank_level_pct=req_data.current_tank_level_pct,
        required_liters=req_data.required_liters,
        days_since_last_delivery=req_data.days_since_last_delivery,
        urgency_reason=req_data.urgency_reason,
        status=RequestStatus.PENDING
    )
    OPERATIONAL_REQUESTS.append(new_req)
    opensearch_service.index_request(new_req.model_dump())

    return {"status": "SUCCESS", "request": new_req.model_dump(), "cedar_auth": explanation}

@app.post("/api/requests/override")
def override_priority(override: OverridePriorityRequest):
    """Ward Officer overrides request priority within their designated ward."""
    context = {
        "officer_ward": override.officer_ward,
        "override_reason": override.override_reason
    }
    allowed, explanation = cedar_engine.authorize(
        principal_role="WardOfficer",
        principal_id=override.officer_id,
        action="OverridePriority",
        resource_id=override.request_id,
        resource_ward=override.target_ward_id,
        context=context
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=f"Cedar Authorization Failed: {explanation}")

    target = next((r for r in OPERATIONAL_REQUESTS if r.request_id == override.request_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Request not found")

    target.is_overridden = True
    target.override_priority_score = override.override_priority_score
    target.override_reason = override.override_reason
    target.overridden_by_officer_id = override.officer_id

    return {
        "status": "OVERRIDE_APPLIED",
        "request_id": target.request_id,
        "effective_priority": target.effective_priority,
        "cedar_audit": explanation
    }

@app.post("/api/agent/dispatch")
def run_agent_dispatch():
    """Dispatcher invokes the Strands Agent to run the dispatch cycle."""
    allowed, explanation = cedar_engine.authorize(
        principal_role="Dispatcher",
        principal_id="dispatcher-01",
        action="RunAgentPlanning",
        resource_id="fleet"
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=explanation)

    result = dispatch_agent.run_dispatch_cycle()
    # Log dispatches into OpenSearch
    for r in result["plan"]["tanker_routes"]:
        for s in r["stops"]:
            opensearch_service.index_delivery({
                "area_name": s["area_name"],
                "ward_id": s["ward_id"],
                "liters": s["liters_to_deliver"],
                "timestamp": "today"
            })
    return result

@app.post("/api/agent/replan_breakdown")
def replan_breakdown(tanker_id: str = "TANKER-02"):
    """Simulates breakdown of a tanker and triggers agent replan."""
    allowed, explanation = cedar_engine.authorize(
        principal_role="Dispatcher",
        principal_id="dispatcher-01",
        action="TriggerBreakdownReplan",
        resource_id=tanker_id
    )
    if not allowed:
        raise HTTPException(status_code=403, detail=explanation)

    return dispatch_agent.simulate_breakdown_replan(tanker_id)

@app.post("/api/agent/reset")
def reset_system():
    """Resets fleet and request state for demonstration."""
    return dispatch_agent.reset_fleet()

@app.get("/api/opensearch/neglected_areas")
def get_neglected_areas():
    """Auditor / Public view: OpenSearch query detecting neglected areas."""
    profiles = {}
    for req in OPERATIONAL_REQUESTS:
        vuln = SEED_WARDS.get(req.ward_id)
        if vuln:
            profiles[req.ward_id] = {
                "ward_name": req.area_name,
                "vulnerability_score": vuln.calculate_vulnerability_score(),
                "days_since_last_delivery": req.days_since_last_delivery
            }
    neglected = opensearch_service.get_neglected_areas(profiles)
    deliveries = opensearch_service.get_weekly_deliveries_by_area()
    return {
        "neglected_areas": neglected,
        "weekly_deliveries": deliveries
    }

# Mount static files for web dashboard
from fastapi.responses import FileResponse

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"

@app.get("/")
def read_root():
    """Serves the main operations dashboard."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "AquaStrands API is active. Static UI files not found."}

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
