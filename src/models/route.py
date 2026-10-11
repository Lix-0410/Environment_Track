"""Data models for route planning, stops, and explainable dispatch decisions."""

from pydantic import BaseModel, Field
from typing import List, Tuple
from datetime import datetime

class RouteStop(BaseModel):
    stop_sequence: int
    request_id: str
    area_name: str
    ward_id: str
    coords: Tuple[float, float]
    liters_to_deliver: int
    priority_score: float
    estimated_arrival_minutes: int
    decision_reason: str = Field(..., description="Plain-language justification for why this stop was prioritized here")
    vulnerability_highlight: str
    heat_index_highlight: str

class TankerRoute(BaseModel):
    route_id: str
    tanker_id: str
    vehicle_number: str
    total_liters_dispatched: int
    total_distance_km: float
    estimated_total_time_mins: int
    stops: List[RouteStop] = []
    status: str = "PLANNED"  # PLANNED, IN_PROGRESS, COMPLETED, INTERRUPTED

class DispatchPlan(BaseModel):
    plan_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    heatwave_alert_active: bool
    summary_narrative: str
    tanker_routes: List[TankerRoute] = []
    unserved_requests_count: int = 0
    fairness_audit_notes: List[str] = []
