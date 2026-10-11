"""Data models for water tanker fleet management."""

from pydantic import BaseModel, Field
from typing import Tuple, Optional
from enum import Enum

class TankerStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    EN_ROUTE = "EN_ROUTE"
    DELIVERING = "DELIVERING"
    MAINTENANCE = "MAINTENANCE"
    BROKEN_DOWN = "BROKEN_DOWN"

class Tanker(BaseModel):
    tanker_id: str
    vehicle_number: str
    capacity_liters: int = 10000
    current_water_liters: int = 10000
    current_coords: Tuple[float, float]
    trips_left_today: int = 4
    status: TankerStatus = TankerStatus.AVAILABLE
    driver_name: str = "Staff Driver"
    driver_phone: str = "+91-9800000000"
    current_assigned_route_id: Optional[str] = None

    def can_fulfill(self, liters_needed: int) -> bool:
        return self.status == TankerStatus.AVAILABLE and self.current_water_liters >= liters_needed
