"""Data models for water tanker requests from residents and ward officers."""

from pydantic import BaseModel, Field
from typing import Optional, Tuple, Dict, Any
from datetime import datetime
from enum import Enum

class RequestStatus(str, Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    ASSIGNED = "ASSIGNED"
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"

class TankerRequest(BaseModel):
    request_id: str
    resident_id: str
    area_name: str
    ward_id: str
    coords: Tuple[float, float]
    household_count: int
    current_tank_level_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of storage remaining")
    required_liters: int
    days_since_last_delivery: float = Field(..., ge=0.0)
    urgency_reason: str = ""
    status: RequestStatus = RequestStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Priority tracking & Ward Officer Override
    computed_priority_score: Optional[float] = None
    priority_breakdown: Optional[Dict[str, Any]] = None
    is_overridden: bool = False
    override_priority_score: Optional[float] = None
    override_reason: Optional[str] = None
    overridden_by_officer_id: Optional[str] = None

    @property
    def effective_priority(self) -> float:
        if self.is_overridden and self.override_priority_score is not None:
            return self.override_priority_score
        return self.computed_priority_score or 0.0
