"""AWS Strands agent tools for water tanker dispatching."""

from typing import Dict, Any, List, Optional
from strands import tool

from src.core.mock_data import SEED_WARDS, SEED_WEATHER, SEED_REQUESTS, SEED_TANKERS
from src.core.priority_engine import priority_engine
from src.core.route_planner import route_planner
from src.models.fleet import TankerStatus
from src.models.route import DispatchPlan

# In-memory operational state
OPERATIONAL_REQUESTS = [r.model_copy(deep=True) for r in SEED_REQUESTS]
OPERATIONAL_TANKERS = [t.model_copy(deep=True) for t in SEED_TANKERS]
LATEST_PLAN: Optional[DispatchPlan] = None

@tool
def get_forecast(ward_id: str) -> Dict[str, Any]:
    """Retrieves real-time temperature, heat index, and heatwave warning for a ward."""
    weather = SEED_WEATHER.get(ward_id)
    if not weather:
        return {"error": f"Ward {ward_id} not found"}
    return weather.model_dump()

@tool
def get_requests(ward_id: str = "") -> List[Dict[str, Any]]:
    """Retrieves active resident water requests, optionally filtered by ward."""
    results = []
    for r in OPERATIONAL_REQUESTS:
        if not ward_id or r.ward_id == ward_id:
            results.append(r.model_dump())
    return results

@tool
def get_fleet() -> List[Dict[str, Any]]:
    """Retrieves tanker fleet availability, capacities, and GPS locations."""
    return [t.model_dump() for t in OPERATIONAL_TANKERS]

@tool
def compute_priority(request_id: str) -> Dict[str, Any]:
    """Computes explainable priority score for a request using the heatwave formula."""
    req = next((r for r in OPERATIONAL_REQUESTS if r.request_id == request_id), None)
    if not req:
        return {"error": f"Request {request_id} not found"}
    
    ward_vuln = SEED_WARDS.get(req.ward_id)
    ward_weather = SEED_WEATHER.get(req.ward_id)
    if not ward_vuln or not ward_weather:
        return {"error": "Ward data missing"}

    score, breakdown, explanation = priority_engine.compute_priority(req, ward_vuln, ward_weather)
    req.computed_priority_score = score
    req.priority_breakdown = breakdown
    
    return {
        "request_id": request_id,
        "effective_priority": req.effective_priority,
        "breakdown": breakdown,
        "explanation": explanation
    }

@tool
def plan_routes() -> Dict[str, Any]:
    """Computes priority scores for all pending requests and solves route dispatch."""
    global LATEST_PLAN
    for r in OPERATIONAL_REQUESTS:
        ward_vuln = SEED_WARDS.get(r.ward_id)
        ward_weather = SEED_WEATHER.get(r.ward_id)
        if ward_vuln and ward_weather:
            score, breakdown, explanation = priority_engine.compute_priority(r, ward_vuln, ward_weather)
            r.computed_priority_score = score
            r.priority_breakdown = breakdown

    plan = route_planner.plan_dispatch(OPERATIONAL_TANKERS, OPERATIONAL_REQUESTS, heatwave_active=True)
    LATEST_PLAN = plan
    return plan.model_dump()

@tool
def replan_breakdown(tanker_id: str) -> Dict[str, Any]:
    """Simulates breakdown of a tanker and dynamically reallocates its pending stops."""
    global LATEST_PLAN
    target_tanker = next((t for t in OPERATIONAL_TANKERS if t.tanker_id == tanker_id), None)
    if not target_tanker:
        return {"error": f"Tanker {tanker_id} not found"}

    target_tanker.status = TankerStatus.BROKEN_DOWN
    target_tanker.current_water_liters = 0

    # Re-plan routes with remaining available tankers
    new_plan = route_planner.plan_dispatch(OPERATIONAL_TANKERS, OPERATIONAL_REQUESTS, heatwave_active=True)
    new_plan.summary_narrative = (
        f"🚨 EMERGENCY REPLAN: Tanker {tanker_id} broke down! "
        f"Remaining active tankers automatically absorbed critical loads."
    )
    new_plan.fairness_audit_notes.append(f"Tanker {tanker_id} failed; urgent stops reassigned.")
    LATEST_PLAN = new_plan
    return new_plan.model_dump()
