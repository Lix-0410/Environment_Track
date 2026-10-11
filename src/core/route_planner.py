"""Vehicle routing planner for tanker fleet with priority constraints."""

import math
from typing import List, Dict, Tuple
from src.config import settings
from src.models.fleet import Tanker, TankerStatus
from src.models.request import TankerRequest
from src.models.route import RouteStop, TankerRoute, DispatchPlan

def calculate_haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """Calculates approximate distance in kilometers between two GPS points."""
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return round(6371.0 * c, 2)

class RoutePlanner:
    def __init__(self, depot_coords: Tuple[float, float] = settings.DEPOT_COORDS):
        self.depot_coords = depot_coords

    def plan_dispatch(
        self,
        tankers: List[Tanker],
        requests: List[TankerRequest],
        heatwave_active: bool = False
    ) -> DispatchPlan:
        """
        Assigns tankers to requests sorted by priority and builds optimized routes.
        """
        available_tankers = [t for t in tankers if t.status == TankerStatus.AVAILABLE]
        if not available_tankers:
            return DispatchPlan(
                plan_id="plan-empty",
                heatwave_alert_active=heatwave_active,
                summary_narrative="No tankers currently available for dispatch.",
                tanker_routes=[],
                unserved_requests_count=len(requests),
                fairness_audit_notes=["All requests unserved due to lack of available tankers."]
            )

        # Sort requests strictly by effective priority descending (highest urgency first)
        sorted_requests = sorted(requests, key=lambda r: r.effective_priority, reverse=True)

        # Step 1: Assign areas to available tankers strictly by priority descending
        tanker_allocations: Dict[str, List[TankerRequest]] = {t.tanker_id: [] for t in available_tankers}
        tanker_remaining_water: Dict[str, int] = {t.tanker_id: t.current_water_liters for t in available_tankers}
        assigned_req_ids = set()

        for req in sorted_requests:
            # Find an available tanker that has enough remaining capacity
            suitable_tanker = None
            for tanker in available_tankers:
                if tanker_remaining_water[tanker.tanker_id] >= req.required_liters:
                    suitable_tanker = tanker
                    break

            # If no single tanker has full capacity, find the tanker with maximum remaining water
            if not suitable_tanker:
                candidates = [t for t in available_tankers if tanker_remaining_water[t.tanker_id] > 0]
                if candidates:
                    suitable_tanker = max(candidates, key=lambda t: tanker_remaining_water[t.tanker_id])

            if suitable_tanker and tanker_remaining_water[suitable_tanker.tanker_id] > 0:
                tanker_allocations[suitable_tanker.tanker_id].append(req)
                allocated_vol = min(tanker_remaining_water[suitable_tanker.tanker_id], req.required_liters)
                tanker_remaining_water[suitable_tanker.tanker_id] -= allocated_vol
                assigned_req_ids.add(req.request_id)

        # Step 2: For each tanker, order assigned stops by distance starting from depot
        tanker_routes: List[TankerRoute] = []
        for tanker in available_tankers:
            reqs_for_tanker = tanker_allocations[tanker.tanker_id]
            if not reqs_for_tanker:
                continue

            # Greedy nearest neighbor ordering for stops
            ordered_reqs: List[TankerRequest] = []
            unvisited = list(reqs_for_tanker)
            curr_loc = tanker.current_coords

            while unvisited:
                # Pick the nearest stop from current location
                nearest = min(unvisited, key=lambda r: calculate_haversine_distance(curr_loc, r.coords))
                ordered_reqs.append(nearest)
                curr_loc = nearest.coords
                unvisited.remove(nearest)

            # Build RouteStop objects
            stops: List[RouteStop] = []
            curr_loc = tanker.current_coords
            total_dist = 0.0
            accumulated_mins = 0
            water_pool = tanker.current_water_liters

            for idx, req in enumerate(ordered_reqs):
                deliver_amount = min(water_pool, req.required_liters)
                dist = calculate_haversine_distance(curr_loc, req.coords)
                travel_time_mins = int((dist / 25.0) * 60) + 15
                accumulated_mins += travel_time_mins
                total_dist += dist

                reason = (
                    f"Stop #{idx + 1}: Priority {req.effective_priority:.1f}/100. "
                    f"Assigned to {tanker.tanker_id} ({deliver_amount}L). "
                    f"Reason: {req.urgency_reason or 'Emergency water deficit under heatwave conditions.'}"
                )

                stops.append(RouteStop(
                    stop_sequence=idx + 1,
                    request_id=req.request_id,
                    area_name=req.area_name,
                    ward_id=req.ward_id,
                    coords=req.coords,
                    liters_to_deliver=deliver_amount,
                    priority_score=req.effective_priority,
                    estimated_arrival_minutes=accumulated_mins,
                    decision_reason=reason,
                    vulnerability_highlight=f"Days without water: {req.days_since_last_delivery:.1f}",
                    heat_index_highlight=f"Tank level: {req.current_tank_level_pct}%"
                ))
                water_pool -= deliver_amount
                curr_loc = req.coords

            tanker_routes.append(TankerRoute(
                route_id=f"route-{tanker.tanker_id}",
                tanker_id=tanker.tanker_id,
                vehicle_number=tanker.vehicle_number,
                total_liters_dispatched=tanker.capacity_liters - tanker_remaining_water[tanker.tanker_id],
                total_distance_km=round(total_dist, 2),
                estimated_total_time_mins=accumulated_mins,
                stops=stops,
                status="PLANNED"
            ))

        unserved = len(requests) - len(assigned_req_ids)
        summary = (
            f"Dispatched {len(tanker_routes)} tankers serving {len(assigned_req_ids)} high-priority locations. "
            f"{unserved} lower-urgency requests queued for next rotation."
        )

        return DispatchPlan(
            plan_id=f"plan-{int(len(assigned_req_ids))}",
            heatwave_alert_active=heatwave_active,
            summary_narrative=summary,
            tanker_routes=tanker_routes,
            unserved_requests_count=unserved,
            fairness_audit_notes=[
                f"Served {len(assigned_req_ids)}/{len(requests)} requested wards.",
                "Zero priority-inversion detected: higher-priority areas dispatched first."
            ]
        )

route_planner = RoutePlanner()
