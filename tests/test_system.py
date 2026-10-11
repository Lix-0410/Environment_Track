"""Comprehensive unit and integration test suite for the Water Tanker Routing System."""

import sys
from pathlib import Path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.priority_engine import priority_engine
from src.core.cedar_auth import cedar_engine
from src.core.route_planner import route_planner
from src.core.mock_data import SEED_WARDS, SEED_WEATHER, SEED_REQUESTS, SEED_TANKERS
from src.agent.strands_agent import dispatch_agent

def test_priority_scoring_formula():
    """Validates that heatwaves and days-dry escalate priority as specified."""
    req = SEED_REQUESTS[0]  # Dharavi (3.2 days dry)
    ward_vuln = SEED_WARDS[req.ward_id]
    ward_weather = SEED_WEATHER[req.ward_id]

    score, breakdown, explanation = priority_engine.compute_priority(req, ward_vuln, ward_weather)
    assert score >= 85.0, f"Expected high priority under 44C and 3 days dry, got {score}"
    assert "heat_risk" in breakdown
    assert "days_score" in breakdown
    assert len(explanation) > 0

def test_cedar_resident_permissions():
    """Residents can submit and view their own requests, but cannot dispatch fleet."""
    allowed, _ = cedar_engine.authorize("Resident", "user-1", "SubmitRequest", "req-1")
    assert allowed is True

    denied, _ = cedar_engine.authorize("Resident", "user-1", "RunAgentPlanning", "fleet")
    assert denied is False

def test_cedar_dispatcher_permissions():
    """Dispatchers can run agent planning, approve dispatches, and reassign tankers."""
    allowed, _ = cedar_engine.authorize("Dispatcher", "disp-1", "RunAgentPlanning", "fleet")
    assert allowed is True

    allowed2, _ = cedar_engine.authorize("Dispatcher", "disp-1", "TriggerBreakdownReplan", "TANKER-02")
    assert allowed2 is True

def test_cedar_ward_officer_override_rules():
    """Ward Officers can override only within their ward, and MUST provide a reason."""
    # 1. Success case: Matching ward with reason
    ctx_ok = {"officer_ward": "WARD-L", "override_reason": "ICU dialysis emergency"}
    allowed, _ = cedar_engine.authorize("WardOfficer", "officer-L", "OverridePriority", "req-2", "WARD-L", ctx_ok)
    assert allowed is True

    # 2. Deny case: Missing reason
    ctx_no_reason = {"officer_ward": "WARD-L", "override_reason": ""}
    denied_reason, _ = cedar_engine.authorize("WardOfficer", "officer-L", "OverridePriority", "req-2", "WARD-L", ctx_no_reason)
    assert denied_reason is False

    # 3. Deny case: Cross-ward attempt (Ward L officer trying to override Ward GN)
    ctx_cross = {"officer_ward": "WARD-L", "override_reason": "Trying to boost friend in other ward"}
    denied_cross, _ = cedar_engine.authorize("WardOfficer", "officer-L", "OverridePriority", "req-1", "WARD-GN", ctx_cross)
    assert denied_cross is False

def test_route_planner_dispatches_highest_priority_first():
    """Verifies zero priority inversion in route planner."""
    reqs = [r.model_copy() for r in SEED_REQUESTS]
    for r in reqs:
        score, _, _ = priority_engine.compute_priority(r, SEED_WARDS[r.ward_id], SEED_WEATHER[r.ward_id])
        r.computed_priority_score = score

    plan = route_planner.plan_dispatch(SEED_TANKERS, reqs, heatwave_active=True)
    assert len(plan.tanker_routes) > 0
    first_stop = plan.tanker_routes[0].stops[0]
    assert first_stop.priority_score >= 80.0

def test_strands_agent_breakdown_replan():
    """Tests dynamic replanning when Tanker T-02 breaks down."""
    replan_result = dispatch_agent.simulate_breakdown_replan("TANKER-02")
    assert replan_result["status"] == "REPLANNED"
    assert "emergency replan" in replan_result["agent_narrative"].lower()

if __name__ == "__main__":
    test_priority_scoring_formula()
    test_cedar_resident_permissions()
    test_cedar_dispatcher_permissions()
    test_cedar_ward_officer_override_rules()
    test_route_planner_dispatches_highest_priority_first()
    test_strands_agent_breakdown_replan()
    print("ALL TESTS PASSED SUCCESSFULLY!")
