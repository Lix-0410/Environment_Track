"""Data models for ward vulnerability profiles and heatwave weather forecasts."""

from pydantic import BaseModel, Field
from typing import Tuple

class WardVulnerability(BaseModel):
    ward_id: str
    ward_name: str
    population: int
    piped_supply_hours_per_day: float = Field(..., description="Hours of municipal piped water per day (0 = zero piped access)")
    population_density_per_sqkm: float
    has_hospital_or_clinic: bool = False
    has_schools: bool = True
    elderly_children_share: float = Field(..., ge=0.0, le=1.0, description="Fraction of population that is elderly (60+) or under 5")
    is_informal_settlement: bool = False
    center_coords: Tuple[float, float] = Field(..., description="(Latitude, Longitude)")

    def calculate_vulnerability_score(self) -> float:
        """Computes a normalized 0-100 baseline vulnerability score."""
        # Lack of piped supply contributes up to 45 pts
        piped_deficit = max(0.0, (4.0 - self.piped_supply_hours_per_day) / 4.0) * 45.0
        # High demographic vulnerability (elderly/infants) contributes up to 25 pts
        demographic_score = min(25.0, (self.elderly_children_share / 0.40) * 25.0)
        # Informal settlement / slum clusters add 15 pts
        informal_penalty = 15.0 if self.is_informal_settlement else 0.0
        # Hospital zone adds critical necessity of 15 pts
        facility_score = 15.0 if self.has_hospital_or_clinic else 0.0

        raw_score = piped_deficit + demographic_score + informal_penalty + facility_score
        return round(min(100.0, max(0.0, raw_score)), 2)

class WardWeather(BaseModel):
    ward_id: str
    current_temp_c: float
    forecast_temp_c: float
    relative_humidity_pct: float
    heat_index_c: float
    is_heatwave_alert: bool = False

    def calculate_heat_risk_score(self) -> float:
        """Computes normalized 0-100 heat risk based on heat index."""
        temp_basis = max(self.current_temp_c, self.heat_index_c)
        if temp_basis <= 32.0:
            score = max(0.0, (temp_basis - 25.0) * 2.0)
        elif temp_basis <= 40.0:
            score = 14.0 + ((temp_basis - 32.0) / 8.0) * 46.0  # 14 to 60 pts
        else:
            score = 60.0 + ((temp_basis - 40.0) / 6.0) * 40.0  # 60 to 100 pts
        
        if self.is_heatwave_alert:
            score = min(100.0, score * 1.15)
        return round(min(100.0, max(0.0, score)), 2)
