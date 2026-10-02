"""
Engine 3: Geographic Village Penetration & Momentum Matrix.
Vectorized Uber H3 spatial indexing (Resolutions 7 & 8 as 64-bit uint64 tokens),
Revenue Momentum Index (RMI), Penetration Depth, and Strategic Matrix Categorization.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple, Union
import math
import logging
import polars as pl
import h3

logger = logging.getLogger("azbooks.analytics.engines.village")


@dataclass
class VillageMatrixItem:
    village_id: str
    village_name: str
    taluka: str
    district: str
    h3_res7: int
    h3_res7_hex: str
    h3_res8: int
    h3_res8_hex: str
    is_geocoded: bool
    unique_customers: int
    estimated_market_capacity: int
    penetration_depth: float
    penetration_percentage: float
    current_season_revenue: float
    prior_season_revenue: float
    revenue_momentum_index: float
    revenue_growth_percentage: float
    total_orders: int
    average_order_value: float
    strategic_quadrant: str
    recommended_action: str


@dataclass
class VillageCohortItem:
    customer_id: str
    customer_name: str
    phone: str
    village_id: str
    village_name: str
    taluka: str
    district: str
    total_orders: int
    lifetime_revenue: float
    strategic_quadrant: str
    h3_res7_hex: str
    h3_res8_hex: str


class GeographicVillageEngine:
    """
    High-performance Geographic Village Penetration & Momentum Engine.
    Converts geospatial points to 64-bit BigInt H3 tokens for microsecond integer equality joins,
    computes bounded RMI and penetration metrics, and generates strategic target cohorts.
    """

    STRATEGIC_QUADRANTS = {
        "HIGH_GROWTH_FRONTIER": (
            "High momentum (+15%+) with low market penetration (<35%). "
            "Primary expansion vector: Dispatch field reps, distribute textbook sample kits to schools."
        ),
        "CORE_FORTRESS": (
            "High momentum (+15%+) and high market penetration (>=35%). "
            "Defend market leadership: Deepen account loyalty, cross-sell high-margin stationery."
        ),
        "AT_RISK_DEFENSIVE": (
            "Negative momentum (<0%) despite established penetration (>=35%). "
            "Urgent retention alert: Investigate local competitor poaching or service bottlenecks."
        ),
        "STAGNANT_DESERT": (
            "Negative momentum (<0%) and shallow market penetration (<35%). "
            "Low-yield territory: Reallocate marketing budget unless part of seasonal school cycle."
        ),
        "STABLE_MATURE": (
            "Balanced momentum (0% to +15%). Steady recurring order flow; maintain standard fulfillment."
        ),
    }

    def __init__(
        self,
        frontier_rmi_threshold: float = 0.15,
        penetration_threshold: float = 0.35,
        default_capacity_floor: int = 25,
    ):
        self.frontier_rmi_threshold = max(0.01, frontier_rmi_threshold)
        self.penetration_threshold = max(0.05, min(0.95, penetration_threshold))
        self.default_capacity_floor = max(5, default_capacity_floor)

    @staticmethod
    def latlng_to_h3_tokens(
        lat: Optional[float], lng: Optional[float]
    ) -> Tuple[int, str, int, str, bool]:
        """
        Converts latitude and longitude to 64-bit unsigned BigInt tokens for H3 Res 7 and Res 8.
        Returns: (token_res7, hex_res7, token_res8, hex_res8, is_geocoded)
        Guaranteed zero-crash fallback on None, NaN, or out-of-bound coordinates.
        """
        if lat is None or lng is None:
            return 0, "", 0, "", False

        try:
            lat_f = float(lat)
            lng_f = float(lng)
            if math.isnan(lat_f) or math.isnan(lng_f):
                return 0, "", 0, "", False
            if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
                return 0, "", 0, "", False

            # Resolution 7 (~1.2km radius)
            cell7_hex = h3.latlng_to_cell(lat_f, lng_f, 7)
            token7 = int(cell7_hex, 16)

            # Resolution 8 (~460m radius)
            cell8_hex = h3.latlng_to_cell(lat_f, lng_f, 8)
            token8 = int(cell8_hex, 16)

            return token7, cell7_hex, token8, cell8_hex, True
        except Exception:
            return 0, "", 0, "", False

    def classify_strategic_quadrant(
        self, rmi: float, penetration: float
    ) -> Tuple[str, str]:
        """
        Classifies village performance into one of the 5 strategic quadrants.
        """
        if rmi >= self.frontier_rmi_threshold:
            if penetration < self.penetration_threshold:
                quadrant = "HIGH_GROWTH_FRONTIER"
            else:
                quadrant = "CORE_FORTRESS"
        elif rmi < 0.0:
            if penetration >= self.penetration_threshold:
                quadrant = "AT_RISK_DEFENSIVE"
            else:
                quadrant = "STAGNANT_DESERT"
        else:
            quadrant = "STABLE_MATURE"

        recommendation = self.STRATEGIC_QUADRANTS.get(quadrant, "")
        return quadrant, recommendation

    def analyze(
        self,
        records: Union[List[Dict[str, Any]], pl.DataFrame],
        min_revenue_floor: float = 0.0,
    ) -> List[VillageMatrixItem]:
        """
        Executes vectorized village penetration and momentum calculations.
        Accepts records representing customer orders or regional aggregations with fields:
          - village_id (str)
          - village_name (str)
          - taluka (optional str)
          - district (optional str)
          - customer_id (str)
          - order_id (str)
          - order_total (float)
          - season (str: 'current' or 'prior')
          - latitude (optional float)
          - longitude (optional float)
          - estimated_capacity (optional int)
        """
        if not isinstance(records, pl.DataFrame):
            if not records:
                return []
            df = pl.DataFrame(records)
        else:
            df = records

        if df.is_empty():
            return []

        # Standardize required columns
        schema_cols = df.columns
        if "village_id" not in schema_cols:
            raise ValueError("Input data must contain 'village_id'")
        if "village_name" not in schema_cols:
            df = df.with_columns(pl.col("village_id").alias("village_name"))
        if "taluka" not in schema_cols:
            df = df.with_columns(pl.lit("").alias("taluka"))
        if "district" not in schema_cols:
            df = df.with_columns(pl.lit("").alias("district"))
        if "season" not in schema_cols:
            df = df.with_columns(pl.lit("current").alias("season"))
        if "order_total" not in schema_cols:
            df = df.with_columns(pl.lit(0.0).alias("order_total"))
        if "order_id" not in schema_cols:
            df = df.with_columns(pl.col("customer_id").alias("order_id"))
        if "customer_id" not in schema_cols:
            df = df.with_columns(pl.col("order_id").alias("customer_id"))
        if "latitude" not in schema_cols:
            df = df.with_columns(pl.lit(None).cast(pl.Float64).alias("latitude"))
        if "longitude" not in schema_cols:
            df = df.with_columns(pl.lit(None).cast(pl.Float64).alias("longitude"))
        if "estimated_capacity" not in schema_cols:
            df = df.with_columns(pl.lit(None).cast(pl.Int64).alias("estimated_capacity"))

        # Ingest H3 spatial tokens
        lat_list = df["latitude"].to_list()
        lng_list = df["longitude"].to_list()

        tokens_res7: List[int] = []
        hexes_res7: List[str] = []
        tokens_res8: List[int] = []
        hexes_res8: List[str] = []
        geocoded_flags: List[bool] = []

        for lat, lng in zip(lat_list, lng_list):
            t7, h7, t8, h8, is_geo = self.latlng_to_h3_tokens(lat, lng)
            tokens_res7.append(t7)
            hexes_res7.append(h7)
            tokens_res8.append(t8)
            hexes_res8.append(h8)
            geocoded_flags.append(is_geo)

        df = df.with_columns([
            pl.Series("h3_res7", tokens_res7, dtype=pl.UInt64),
            pl.Series("h3_res7_hex", hexes_res7, dtype=pl.Utf8),
            pl.Series("h3_res8", tokens_res8, dtype=pl.UInt64),
            pl.Series("h3_res8_hex", hexes_res8, dtype=pl.Utf8),
            pl.Series("is_geocoded", geocoded_flags, dtype=pl.Boolean),
        ])

        # Vectorized aggregation by village
        # For spatial tokens, pick the mode/first non-zero token per village
        agg_exprs = [
            pl.col("village_name").first().alias("village_name"),
            pl.col("taluka").first().alias("taluka"),
            pl.col("district").first().alias("district"),
            pl.col("customer_id").n_unique().alias("unique_customers"),
            pl.col("order_id").n_unique().alias("total_orders"),
            # Current Season Revenue
            pl.when(pl.col("season") == "current")
            .then(pl.col("order_total"))
            .otherwise(0.0)
            .sum()
            .round(2)
            .alias("current_season_revenue"),
            # Prior Season Revenue
            pl.when(pl.col("season") == "prior")
            .then(pl.col("order_total"))
            .otherwise(0.0)
            .sum()
            .round(2)
            .alias("prior_season_revenue"),
            # Capacity estimate
            pl.col("estimated_capacity").max().alias("specified_capacity"),
            # Spatial token resolution
            pl.col("h3_res7").max().alias("h3_res7"),
            pl.col("h3_res7_hex").filter(pl.col("h3_res7_hex") != "").first().fill_null("").alias("h3_res7_hex"),
            pl.col("h3_res8").max().alias("h3_res8"),
            pl.col("h3_res8_hex").filter(pl.col("h3_res8_hex") != "").first().fill_null("").alias("h3_res8_hex"),
            pl.col("is_geocoded").max().alias("is_geocoded"),
        ]

        grouped = df.group_by("village_id").agg(agg_exprs)

        results: List[VillageMatrixItem] = []
        for row in grouped.iter_rows(named=True):
            v_id = str(row["village_id"])
            v_name = str(row["village_name"] or v_id)
            taluka = str(row["taluka"] or "")
            district = str(row["district"] or "")
            uniq_cust = int(row["unique_customers"] or 0)
            tot_orders = int(row["total_orders"] or 0)
            curr_rev = float(row["current_season_revenue"] or 0.0)
            prior_rev = float(row["prior_season_revenue"] or 0.0)

            if curr_rev < min_revenue_floor and prior_rev < min_revenue_floor:
                continue

            # Capacity estimation floor
            spec_cap = row["specified_capacity"]
            if spec_cap is not None and not math.isnan(spec_cap) and int(spec_cap) > 0:
                est_capacity = max(uniq_cust, int(spec_cap))
            else:
                est_capacity = max(self.default_capacity_floor, int(uniq_cust * 2.5))

            # Bounded Penetration Depth: P_v in [0.0, 1.0]
            penetration_depth = min(1.0, max(0.0, uniq_cust / max(1, est_capacity)))
            penetration_pct = round(penetration_depth * 100.0, 2)

            # Revenue Momentum Index: Division-by-zero immune with max(1.0, prior_rev)
            # RMI = (Current - Prior) / max(1.0, Prior)
            safe_prior = max(1.0, prior_rev)
            rmi = (curr_rev - prior_rev) / safe_prior
            rmi = round(rmi, 4)
            growth_pct = round(rmi * 100.0, 2)

            # Average Order Value
            tot_rev = curr_rev + prior_rev
            aov = round(tot_rev / max(1, tot_orders), 2)

            # Strategic Quadrant
            quadrant, action = self.classify_strategic_quadrant(rmi, penetration_depth)

            results.append(
                VillageMatrixItem(
                    village_id=v_id,
                    village_name=v_name,
                    taluka=taluka,
                    district=district,
                    h3_res7=int(row["h3_res7"] or 0),
                    h3_res7_hex=str(row["h3_res7_hex"] or ""),
                    h3_res8=int(row["h3_res8"] or 0),
                    h3_res8_hex=str(row["h3_res8_hex"] or ""),
                    is_geocoded=bool(row["is_geocoded"] or False),
                    unique_customers=uniq_cust,
                    estimated_market_capacity=est_capacity,
                    penetration_depth=round(penetration_depth, 4),
                    penetration_percentage=penetration_pct,
                    current_season_revenue=curr_rev,
                    prior_season_revenue=prior_rev,
                    revenue_momentum_index=rmi,
                    revenue_growth_percentage=growth_pct,
                    total_orders=tot_orders,
                    average_order_value=aov,
                    strategic_quadrant=quadrant,
                    recommended_action=action,
                )
            )

        # Sort by Revenue Momentum Index descending (highest growth frontiers first)
        results.sort(key=lambda item: item.revenue_momentum_index, reverse=True)
        return results

    def extract_target_cohort(
        self,
        records: Union[List[Dict[str, Any]], pl.DataFrame],
        target_quadrants: Optional[List[str]] = None,
        target_village_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Extracts actionable customer outreach records filtered by strategic quadrant or village IDs.
        Produces payload conforming to DiscoverySegment schema.
        """
        matrix_items = self.analyze(records)
        village_map: Dict[str, VillageMatrixItem] = {
            item.village_id: item for item in matrix_items
        }

        # Determine qualifying villages
        qualifying_village_ids = set()
        for v_id, item in village_map.items():
            if target_quadrants and item.strategic_quadrant not in target_quadrants:
                continue
            if target_village_ids and v_id not in target_village_ids:
                continue
            qualifying_village_ids.add(v_id)

        if not isinstance(records, pl.DataFrame):
            df = pl.DataFrame(records)
        else:
            df = records

        if df.is_empty() or not qualifying_village_ids:
            return {
                "segment_name": "Target Geographic Cohort",
                "target_quadrants": target_quadrants or [],
                "target_village_count": 0,
                "total_customers": 0,
                "potential_pipeline_revenue": 0.0,
                "customers": [],
            }

        # Filter customers in qualifying villages
        filtered = df.filter(pl.col("village_id").is_in(list(qualifying_village_ids)))

        # Ensure required columns
        for col_name, default_val in [
            ("customer_name", "Valued Customer"),
            ("phone", ""),
            ("taluka", ""),
            ("district", ""),
            ("order_total", 0.0),
        ]:
            if col_name not in filtered.columns:
                filtered = filtered.with_columns(pl.lit(default_val).alias(col_name))

        # Customer-level grouping
        cust_grouped = filtered.group_by("customer_id").agg([
            pl.col("customer_name").first().alias("customer_name"),
            pl.col("phone").first().alias("phone"),
            pl.col("village_id").first().alias("village_id"),
            pl.col("village_name").first().alias("village_name"),
            pl.col("taluka").first().alias("taluka"),
            pl.col("district").first().alias("district"),
            pl.col("order_id").n_unique().alias("total_orders"),
            pl.col("order_total").sum().round(2).alias("lifetime_revenue"),
        ])

        customers_list: List[Dict[str, Any]] = []
        total_pipeline_revenue = 0.0

        for row in cust_grouped.iter_rows(named=True):
            v_id = str(row["village_id"])
            v_meta = village_map.get(v_id)
            quadrant = v_meta.strategic_quadrant if v_meta else "UNKNOWN"
            h7_hex = v_meta.h3_res7_hex if v_meta else ""
            h8_hex = v_meta.h3_res8_hex if v_meta else ""
            rev = float(row["lifetime_revenue"] or 0.0)
            total_pipeline_revenue += rev

            customers_list.append({
                "customer_id": str(row["customer_id"]),
                "customer_name": str(row["customer_name"]),
                "phone": str(row["phone"]),
                "village_id": v_id,
                "village_name": str(row["village_name"]),
                "taluka": str(row["taluka"]),
                "district": str(row["district"]),
                "total_orders": int(row["total_orders"] or 0),
                "lifetime_revenue": rev,
                "strategic_quadrant": quadrant,
                "h3_res7_hex": h7_hex,
                "h3_res8_hex": h8_hex,
            })

        # Sort highest lifetime spenders first
        customers_list.sort(key=lambda c: c["lifetime_revenue"], reverse=True)

        quadrant_label = (
            ", ".join(target_quadrants) if target_quadrants else "All Qualified"
        )
        return {
            "segment_name": f"Geographic Outreach Segment: {quadrant_label}",
            "target_quadrants": target_quadrants or [],
            "target_village_count": len(qualifying_village_ids),
            "total_customers": len(customers_list),
            "potential_pipeline_revenue": round(total_pipeline_revenue, 2),
            "customers": customers_list,
        }


# Singleton engine instance
village_engine = GeographicVillageEngine()
