"""System configuration and operational constants for the Water Tanker Routing Agent."""

import os
from typing import Tuple
from pydantic import BaseModel, Field

class Settings(BaseModel):
    APP_NAME: str = "Heatwave-Aware Water Tanker Routing Agent"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "127.0.0.1")

    # Default Depot Coordinates (Central Municipal Water Filling Station)
    DEPOT_COORDS: Tuple[float, float] = (19.0760, 72.8777)
    DEPOT_NAME: str = "Central Municipal Reservoir Station"

    # Priority Scoring Formula Weights:
    # priority = w1*heat_risk + w2*days_since_last_delivery + w3*vulnerability + w4*unmet_demand
    WEIGHT_HEAT_RISK: float = 0.35
    WEIGHT_DAYS_WITHOUT_WATER: float = 0.30
    WEIGHT_VULNERABILITY: float = 0.20
    WEIGHT_UNMET_DEMAND: float = 0.15

    # Heat Index Thresholds (Celsius)
    HEATWAVE_THRESHOLD_TEMP: float = 40.0
    EXTREME_HEATWAVE_TEMP: float = 43.5

    # Storage & OpenSearch configuration
    OPENSEARCH_HOST: str = os.getenv("OPENSEARCH_HOST", "localhost")
    OPENSEARCH_PORT: int = int(os.getenv("OPENSEARCH_PORT", "9200"))
    USE_MOCK_OPENSEARCH: bool = True

settings = Settings()
