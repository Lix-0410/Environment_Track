"""Explainable priority scoring engine for heatwave water dispatch."""

from typing import Dict, Any, Tuple
from src.config import settings
from src.models.request import TankerRequest
from src.models.ward import WardVulnerability, WardWeather

class PriorityEngine:
    def __init__(
        self,
        w_heat: float = settings.WEIGHT_HEAT_RISK,
        w_days: float = settings.WEIGHT_DAYS_WITHOUT_WATER,
        w_vuln: float = settings.WEIGHT_VULNERABILITY,
        w_demand: float = settings.WEIGHT_UNMET_DEMAND,
    ):
        self.w_heat = w_heat
        self.w_days = w_days
        self.w_vuln = w_vuln
        self.w_demand = w_demand

    def compute_priority(
        self,
        request: TankerRequest,
        ward_vuln: WardVulnerability,
        ward_weather: WardWeather,
    ) -> Tuple[float, Dict[str, Any], str]:
        """
        Computes the priority score (0-100) and produces an explainable breakdown.
        Formula:
            priority = w1*heat_risk + w2*days_without_water + w3*vulnerability + w4*unmet_demand
        """
        # 1. Heat Risk (0 - 100)
        heat_risk = ward_weather.calculate_heat_risk_score()

        # 2. Days Since Last Delivery (0 - 100): Escalates rapidly past day 2
        days = request.days_since_last_delivery
        if days <= 1.0:
            days_score = days * 25.0
        elif days <= 3.0:
            days_score = 25.0 + (days - 1.0) * 30.0  # up to 85
        else:
            days_score = min(100.0, 85.0 + (days - 3.0) * 15.0)

        # 3. Area Vulnerability (0 - 100)
        vuln_score = ward_vuln.calculate_vulnerability_score()

        # 4. Unmet Demand / Tank Exhaustion (0 - 100)
        tank_exhaustion = 100.0 - request.current_tank_level_pct
        demand_score = tank_exhaustion * 0.70 + min(30.0, (request.household_count / 100.0) * 30.0)
        demand_score = min(100.0, max(0.0, demand_score))

        # Weighted Composite
        raw_priority = (
            self.w_heat * heat_risk +
            self.w_days * days_score +
            self.w_vuln * vuln_score +
            self.w_demand * demand_score
        )
        final_priority = round(min(100.0, max(0.0, raw_priority)), 2)

        breakdown = {
            "heat_risk": round(heat_risk, 2),
            "days_score": round(days_score, 2),
            "vulnerability_score": round(vuln_score, 2),
            "unmet_demand_score": round(demand_score, 2),
            "weights": {
                "w_heat": self.w_heat,
                "w_days": self.w_days,
                "w_vulnerability": self.w_vuln,
                "w_unmet_demand": self.w_demand,
            },
            "temperature_c": ward_weather.current_temp_c,
            "heat_index_c": ward_weather.heat_index_c,
            "days_without_water": days,
            "piped_supply_hours": ward_vuln.piped_supply_hours_per_day,
            "tank_remaining_pct": request.current_tank_level_pct
        }

        # Human-readable justification narrative
        reasons = []
        if heat_risk >= 75.0:
            reasons.append(f"Extreme heat stress (Temp: {ward_weather.current_temp_c}°C, Heat Index: {ward_weather.heat_index_c}°C)")
        if days >= 2.0:
            reasons.append(f"Severe dry duration ({days:.1f} days without tanker/piped delivery)")
        if ward_vuln.is_informal_settlement:
            reasons.append("Dense informal settlement with zero piped infrastructure")
        if ward_vuln.has_hospital_or_clinic:
            reasons.append("Critical healthcare clinic/hospital nearby")
        if request.current_tank_level_pct <= 15.0:
            reasons.append(f"Storage critically depleted ({request.current_tank_level_pct}% remaining)")

        explanation = "; ".join(reasons) if reasons else "Routine replenishment under normal heat conditions."
        return final_priority, breakdown, explanation

priority_engine = PriorityEngine()
