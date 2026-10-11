"""Realistic seed dataset for heatwave water tanker routing scenarios."""

from typing import Dict, List
from src.models.ward import WardVulnerability, WardWeather
from src.models.request import TankerRequest, RequestStatus
from src.models.fleet import Tanker, TankerStatus

# 1. Ward Vulnerability Profiles
SEED_WARDS: Dict[str, WardVulnerability] = {
    "WARD-GN": WardVulnerability(
        ward_id="WARD-GN",
        ward_name="Dharavi Sector 5 (Informal Cluster)",
        population=45000,
        piped_supply_hours_per_day=0.0,
        population_density_per_sqkm=65000.0,
        has_hospital_or_clinic=False,
        has_schools=True,
        elderly_children_share=0.38,
        is_informal_settlement=True,
        center_coords=(19.0402, 72.8550)
    ),
    "WARD-L": WardVulnerability(
        ward_id="WARD-L",
        ward_name="Kurla District Healthcare Zone",
        population=32000,
        piped_supply_hours_per_day=1.5,
        population_density_per_sqkm=42000.0,
        has_hospital_or_clinic=True,
        has_schools=True,
        elderly_children_share=0.25,
        is_informal_settlement=False,
        center_coords=(19.0688, 72.8797)
    ),
    "WARD-ME": WardVulnerability(
        ward_id="WARD-ME",
        ward_name="Govandi Transit Resettlement Colony",
        population=28000,
        piped_supply_hours_per_day=0.0,
        population_density_per_sqkm=52000.0,
        has_hospital_or_clinic=False,
        has_schools=False,
        elderly_children_share=0.35,
        is_informal_settlement=True,
        center_coords=(19.0558, 72.9152)
    ),
    "WARD-HE": WardVulnerability(
        ward_id="WARD-HE",
        ward_name="Bandra East Housing Society",
        population=18000,
        piped_supply_hours_per_day=3.0,
        population_density_per_sqkm=22000.0,
        has_hospital_or_clinic=False,
        has_schools=True,
        elderly_children_share=0.20,
        is_informal_settlement=False,
        center_coords=(19.0596, 72.8465)
    ),
    "WARD-KW": WardVulnerability(
        ward_id="WARD-KW",
        ward_name="Andheri West Residential Enclave",
        population=25000,
        piped_supply_hours_per_day=4.0,
        population_density_per_sqkm=19000.0,
        has_hospital_or_clinic=False,
        has_schools=True,
        elderly_children_share=0.18,
        is_informal_settlement=False,
        center_coords=(19.1197, 72.8464)
    )
}

# 2. Weather & Heatwave Forecast
SEED_WEATHER: Dict[str, WardWeather] = {
    "WARD-GN": WardWeather(
        ward_id="WARD-GN",
        current_temp_c=43.5,
        forecast_temp_c=44.8,
        relative_humidity_pct=62.0,
        heat_index_c=46.2,
        is_heatwave_alert=True
    ),
    "WARD-L": WardWeather(
        ward_id="WARD-L",
        current_temp_c=42.8,
        forecast_temp_c=43.9,
        relative_humidity_pct=58.0,
        heat_index_c=44.5,
        is_heatwave_alert=True
    ),
    "WARD-ME": WardWeather(
        ward_id="WARD-ME",
        current_temp_c=44.0,
        forecast_temp_c=45.2,
        relative_humidity_pct=60.0,
        heat_index_c=47.0,
        is_heatwave_alert=True
    ),
    "WARD-HE": WardWeather(
        ward_id="WARD-HE",
        current_temp_c=40.5,
        forecast_temp_c=41.5,
        relative_humidity_pct=65.0,
        heat_index_c=42.2,
        is_heatwave_alert=False
    ),
    "WARD-KW": WardWeather(
        ward_id="WARD-KW",
        current_temp_c=39.5,
        forecast_temp_c=40.2,
        relative_humidity_pct=66.0,
        heat_index_c=40.8,
        is_heatwave_alert=False
    )
}

# 3. Active Resident Requests
SEED_REQUESTS: List[TankerRequest] = [
    TankerRequest(
        request_id="REQ-001",
        resident_id="res-dharavi-01",
        area_name="Dharavi Sector 5 Cluster",
        ward_id="WARD-GN",
        coords=(19.0402, 72.8550),
        household_count=850,
        current_tank_level_pct=5.0,
        required_liters=9000,
        days_since_last_delivery=3.2,
        urgency_reason="Tank dry for 3 days; extreme 44°C heatwave; elderly fainting; zero piped supply.",
        status=RequestStatus.PENDING
    ),
    TankerRequest(
        request_id="REQ-002",
        resident_id="res-kurla-hosp",
        area_name="Kurla Municipal Dialysis Clinic & ICU",
        ward_id="WARD-L",
        coords=(19.0688, 72.8797),
        household_count=120,
        current_tank_level_pct=12.0,
        required_liters=6000,
        days_since_last_delivery=1.5,
        urgency_reason="Hemodialysis machines & fever inpatient ward running out of reserves.",
        status=RequestStatus.PENDING
    ),
    TankerRequest(
        request_id="REQ-003",
        resident_id="res-govandi-04",
        area_name="Govandi Transit Resettlement Block C",
        ward_id="WARD-ME",
        coords=(19.0558, 72.9152),
        household_count=600,
        current_tank_level_pct=8.0,
        required_liters=8000,
        days_since_last_delivery=2.8,
        urgency_reason="Community storage exhausted; children suffering dehydration in 45°C heat.",
        status=RequestStatus.PENDING
    ),
    TankerRequest(
        request_id="REQ-004",
        resident_id="res-bandra-02",
        area_name="Bandra East Housing Society",
        ward_id="WARD-HE",
        coords=(19.0596, 72.8465),
        household_count=220,
        current_tank_level_pct=28.0,
        required_liters=5000,
        days_since_last_delivery=1.0,
        urgency_reason="Overhead tanks low; regular municipal supply was delayed by 2 hours.",
        status=RequestStatus.PENDING
    ),
    TankerRequest(
        request_id="REQ-005",
        resident_id="res-andheri-09",
        area_name="Andheri West Heights Enclave",
        ward_id="WARD-KW",
        coords=(19.1197, 72.8464),
        household_count=150,
        current_tank_level_pct=45.0,
        required_liters=4000,
        days_since_last_delivery=0.8,
        urgency_reason="Preventative refill request ahead of weekend.",
        status=RequestStatus.PENDING
    )
]

# 4. Tanker Fleet
SEED_TANKERS: List[Tanker] = [
    Tanker(
        tanker_id="TANKER-01",
        vehicle_number="MH-01-CV-1044",
        capacity_liters=10000,
        current_water_liters=10000,
        current_coords=(19.0760, 72.8777),
        trips_left_today=4,
        status=TankerStatus.AVAILABLE,
        driver_name="Ramesh Yadav",
        driver_phone="+91-9820112233"
    ),
    Tanker(
        tanker_id="TANKER-02",
        vehicle_number="MH-01-CV-2289",
        capacity_liters=12000,
        current_water_liters=12000,
        current_coords=(19.0760, 72.8777),
        trips_left_today=3,
        status=TankerStatus.AVAILABLE,
        driver_name="Sanjay Patil",
        driver_phone="+91-9820445566"
    ),
    Tanker(
        tanker_id="TANKER-03",
        vehicle_number="MH-01-CV-3310",
        capacity_liters=8000,
        current_water_liters=8000,
        current_coords=(19.0760, 72.8777),
        trips_left_today=4,
        status=TankerStatus.AVAILABLE,
        driver_name="Mohammad Khan",
        driver_phone="+91-9820778899"
    ),
    Tanker(
        tanker_id="TANKER-04",
        vehicle_number="MH-01-CV-4402",
        capacity_liters=10000,
        current_water_liters=10000,
        current_coords=(19.0760, 72.8777),
        trips_left_today=3,
        status=TankerStatus.AVAILABLE,
        driver_name="Deepak Shinde",
        driver_phone="+91-9820001122"
    )
]
