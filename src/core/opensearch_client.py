"""OpenSearch client for geospatial queries, delivery tracking, and neglected area detection."""

from typing import List, Dict, Any

class OpenSearchService:
    def __init__(self, host: str = "localhost", port: int = 9200, mock_mode: bool = True):
        self.mock_mode = mock_mode
        self.requests_index: List[Dict[str, Any]] = []
        self.deliveries_index: List[Dict[str, Any]] = []

    def index_request(self, request_data: Dict[str, Any]):
        self.requests_index.append(request_data)

    def index_delivery(self, delivery_data: Dict[str, Any]):
        self.deliveries_index.append(delivery_data)

    def query_geo_nearby_requests(
        self,
        lat: float,
        lon: float,
        radius_km: float = 5.0
    ) -> List[Dict[str, Any]]:
        """Executes an OpenSearch geo_distance query to find nearby demand clusters."""
        results = []
        for r in self.requests_index:
            r_lat, r_lon = r.get("coords", (lat, lon))
            dist_km = ((lat - r_lat)**2 + (lon - r_lon)**2)**0.5 * 111.0
            if dist_km <= radius_km:
                results.append({**r, "distance_km": round(dist_km, 2)})
        return sorted(results, key=lambda x: x["distance_km"])

    def get_weekly_deliveries_by_area(self) -> Dict[str, int]:
        """OpenSearch Terms aggregation: count of deliveries per area in the last 7 days."""
        counts = {}
        for d in self.deliveries_index:
            area = d.get("area_name", "Unknown")
            counts[area] = counts.get(area, 0) + 1
        return counts

    def get_neglected_areas(self, vulnerability_profiles: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        OpenSearch Analytics Query:
        Identifies areas with high vulnerability score (>45) but 0 or fewer than 2 deliveries in past 7 days.
        """
        delivery_counts = self.get_weekly_deliveries_by_area()
        neglected = []

        for ward_id, profile in vulnerability_profiles.items():
            area_name = profile.get("ward_name", ward_id)
            deliveries = delivery_counts.get(area_name, 0)
            vuln_score = profile.get("vulnerability_score", 0.0)
            days_dry = profile.get("days_since_last_delivery", 0.0)

            if vuln_score >= 45.0 and (deliveries == 0 or days_dry >= 2.0):
                neglected.append({
                    "ward_id": ward_id,
                    "area_name": area_name,
                    "deliveries_last_7_days": deliveries,
                    "vulnerability_score": vuln_score,
                    "days_without_water": days_dry,
                    "risk_level": "CRITICAL" if days_dry >= 3.0 else "HIGH",
                    "audit_alert": f"Area '{area_name}' has received only {deliveries} deliveries this week despite {days_dry:.1f} days without water."
                })

        return sorted(neglected, key=lambda x: x["vulnerability_score"], reverse=True)

opensearch_service = OpenSearchService()
