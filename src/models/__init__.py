"""Domain data models for water tanker routing system."""

from src.models.ward import WardVulnerability, WardWeather
from src.models.request import TankerRequest, RequestStatus
from src.models.fleet import Tanker, TankerStatus
from src.models.route import RouteStop, TankerRoute, DispatchPlan

__all__ = [
    "WardVulnerability",
    "WardWeather",
    "TankerRequest",
    "RequestStatus",
    "Tanker",
    "TankerStatus",
    "RouteStop",
    "TankerRoute",
    "DispatchPlan",
]
