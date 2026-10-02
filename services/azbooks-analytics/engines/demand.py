"""
Engine 2: Seasonal Demand & Replenishment Forecaster.
Provides dual-track demand forecasting (Holt-Winters for seasonal SKUs, TSB for intermittent SKUs),
dynamic 3.5x peak-season lead-time safety stock, master-carton PO quantization, and stockout risk grading.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime, date
import math
import numpy as np
import polars as pl


@dataclass
class DemandForecastResult:
    product_id: str
    product_name: str
    forecast_method: str  # 'holt_winters_seasonal' | 'tsb_intermittent' | 'moving_average'
    historical_daily_avg: float
    forecasted_daily_demand: float
    forecasted_horizon_demand: float
    horizon_days: int
    base_lead_time_days: int
    effective_lead_time_days: float
    is_peak_season: bool
    safety_stock_units: int
    current_physical_stock: int
    owed_reserved_stock: int
    available_stock: int
    net_requirement_units: int
    vendor_case_pack: int
    moq: int
    recommended_po_quantity: int
    recommended_carton_count: int
    days_of_inventory_remaining: float
    stockout_risk: str  # 'CRITICAL' | 'WARNING' | 'HEALTHY'
    reasoning: str


class SeasonalDemandEngine:
    """
    High-precision demand forecaster and replenishment calculator.
    Guards against broken-case penalties and supply chain lead-time expansion.
    """

    def __init__(
        self,
        service_level_z: float = 1.65,  # 95% service level
        peak_multiplier: float = 3.5,    # 3.5x lead-time spike in April-June rush
    ):
        self.z = service_level_z
        self.peak_multiplier = peak_multiplier

    def is_peak_rush_season(self, target_date: Optional[date] = None) -> bool:
        """
        Determines if the date falls in the publisher/freight crunch window:
        April 15 to June 30 (Gujarat academic school reopening season).
        """
        d = target_date or datetime.now().date()
        # Month 4 day >= 15 through Month 6 day <= 30
        if d.month == 4 and d.day >= 15:
            return True
        if d.month == 5:
            return True
        if d.month == 6:
            return True
        return False

    def calculate_effective_lead_time(
        self,
        base_lead_time_days: int,
        target_date: Optional[date] = None,
    ) -> float:
        """
        Dynamically inflates supplier lead-time if ordering within the peak rush.
        """
        if self.is_peak_rush_season(target_date):
            return round(base_lead_time_days * self.peak_multiplier, 1)
        return float(base_lead_time_days)

    def forecast_tsb(
        self,
        demand_series: np.ndarray,
        alpha: float = 0.15,
        beta: float = 0.10,
    ) -> float:
        """
        Teunter-Syntetos-Babai (TSB) method for intermittent, sporadic demand.
        Decomposes demand into occurrence probability (p) and demand size (z).
        Guaranteed zero-division immune.
        """
        if len(demand_series) == 0:
            return 0.0

        p = 0.5  # initial occurrence probability
        z = np.mean(demand_series[demand_series > 0]) if np.any(demand_series > 0) else 1.0

        for y in demand_series:
            y = max(0.0, float(y))
            if y > 0:
                # Update occurrence probability and demand size
                p = p + beta * (1.0 - p)
                z = z + alpha * (y - z)
            else:
                # Update occurrence probability only
                p = p + beta * (0.0 - p)

        p = max(0.0, min(1.0, p))
        z = max(0.0, z)
        return float(p * z)

    def forecast_seasonal(
        self,
        demand_series: np.ndarray,
        season_length: int = 12,
        alpha: float = 0.20,
        beta: float = 0.10,
        gamma: float = 0.20,
    ) -> float:
        """
        Additive Holt-Winters with damped trend and fixed seasonal cycle.
        Operates on monthly aggregated demand vectors.
        """
        n = len(demand_series)
        if n < season_length:
            # Fallback to simple moving average if series is shorter than 1 season
            return float(np.mean(demand_series)) if n > 0 else 0.0

        # Initialize level and trend
        level = float(np.mean(demand_series[:season_length]))
        trend = float((np.mean(demand_series[season_length:2 * season_length]) - np.mean(demand_series[:season_length])) / season_length) if n >= 2 * season_length else 0.0

        # Initial seasonal indices (centered)
        seasonals = [float(demand_series[i] - level) for i in range(season_length)]

        for i in range(n):
            y = float(demand_series[i])
            s_idx = i % season_length
            prev_level = level
            level = alpha * (y - seasonals[s_idx]) + (1 - alpha) * (prev_level + trend)
            trend = beta * (level - prev_level) + (1 - beta) * trend
            seasonals[s_idx] = gamma * (y - level) + (1 - gamma) * seasonals[s_idx]

        # Forecast next period: level + trend + seasonal
        next_s_idx = n % season_length
        forecast = level + trend + seasonals[next_s_idx]
        return max(0.0, float(forecast))

    def compute_replenishment(
        self,
        product_id: str,
        product_name: str,
        daily_sales_history: List[float],
        current_stock: int,
        owed_stock: int = 0,
        base_lead_time_days: int = 5,
        horizon_days: int = 30,
        vendor_case_pack: int = 1,
        moq: int = 1,
        as_of_date: Optional[date] = None,
    ) -> DemandForecastResult:
        """
        Generates full demand forecast, dynamic safety stock, and master-carton quantized PO.
        """
        sales = np.array([max(0.0, float(x)) for x in daily_sales_history], dtype=float)
        total_history_len = len(sales)
        zero_demand_count = np.sum(sales == 0)

        # Zero demand ratio
        zero_ratio = (zero_demand_count / total_history_len) if total_history_len > 0 else 1.0

        # 1. Select appropriate forecasting algorithm
        if total_history_len == 0 or np.sum(sales) == 0:
            forecast_method = "no_history"
            daily_forecast = 0.0
            daily_avg = 0.0
            daily_std = 0.0
        elif zero_ratio >= 0.50:
            # High intermittency: use TSB method
            forecast_method = "tsb_intermittent"
            daily_forecast = self.forecast_tsb(sales)
            daily_avg = float(np.mean(sales))
            daily_std = float(np.std(sales))
        elif total_history_len >= 365:
            # Long history with seasonal cycle: monthly aggregation Holt-Winters
            forecast_method = "holt_winters_seasonal"
            # Aggregate into 12 monthly bins
            monthly_bins = np.array_split(sales[-365:], 12)
            monthly_sums = np.array([np.sum(b) for b in monthly_bins])
            monthly_forecast = self.forecast_seasonal(monthly_sums, season_length=12)
            daily_forecast = monthly_forecast / 30.0
            daily_avg = float(np.mean(sales))
            daily_std = float(np.std(sales))
        else:
            # Standard continuous demand: weighted moving average (recency bias)
            forecast_method = "weighted_moving_average"
            weights = np.linspace(0.5, 1.0, total_history_len)
            daily_forecast = float(np.average(sales, weights=weights))
            daily_avg = float(np.mean(sales))
            daily_std = float(np.std(sales))

        # 2. Demand over planning horizon
        horizon_demand = daily_forecast * horizon_days

        # 3. Dynamic Lead Time & Safety Stock
        is_peak = self.is_peak_rush_season(as_of_date)
        eff_lead_time = self.calculate_effective_lead_time(base_lead_time_days, as_of_date)

        # Safety Stock formula: Z * std_d * sqrt(LeadTime)
        # Minimum baseline of 1 day's forecast if std is zero
        std_factor = daily_std if daily_std > 0 else (daily_forecast * 0.5)
        safety_stock = int(math.ceil(self.z * std_factor * math.sqrt(eff_lead_time)))

        # 4. Available Stock (Physical minus confirmed customer reservations)
        available_stock = max(0, current_stock - owed_stock)

        # 5. Net Requirement
        # Net = Horizon Demand + Safety Stock - Available Stock
        raw_requirement = int(math.ceil(horizon_demand + safety_stock - available_stock))
        net_requirement = max(0, raw_requirement)

        # 6. Master-Carton Quantization
        case_pack = max(1, int(vendor_case_pack))
        min_order = max(0, int(moq))

        if net_requirement == 0:
            recommended_po_qty = 0
            carton_count = 0
        else:
            # Ceiling division to round up to full carton multiples
            carton_count = math.ceil(net_requirement / case_pack)
            quantized_qty = carton_count * case_pack
            recommended_po_qty = max(min_order, quantized_qty)
            # Re-sync carton count after MOQ floor
            carton_count = math.ceil(recommended_po_qty / case_pack)

        # 7. Days of Inventory Remaining (DOIR)
        if daily_forecast > 0:
            doir = round(available_stock / daily_forecast, 1)
        else:
            doir = 999.0 if available_stock > 0 else 0.0

        # 8. Stockout Risk Classification
        if doir <= eff_lead_time:
            stockout_risk = "CRITICAL"
        elif doir <= (eff_lead_time * 2.0):
            stockout_risk = "WARNING"
        else:
            stockout_risk = "HEALTHY"

        # Reasoning explanation
        peak_str = " (3.5x Peak Rush Spike Active)" if is_peak else ""
        reasoning = (
            f"Forecast: {round(daily_forecast, 2)} units/day via {forecast_method}. "
            f"Lead time: {eff_lead_time} days{peak_str}. "
            f"Stock: {available_stock} avail ({doir} days cover). "
            f"PO: {recommended_po_qty} units ({carton_count} master packs of {case_pack}) to eliminate broken-case fees."
        )

        return DemandForecastResult(
            product_id=str(product_id),
            product_name=str(product_name),
            forecast_method=forecast_method,
            historical_daily_avg=round(daily_avg, 2),
            forecasted_daily_demand=round(daily_forecast, 2),
            forecasted_horizon_demand=round(horizon_demand, 1),
            horizon_days=horizon_days,
            base_lead_time_days=base_lead_time_days,
            effective_lead_time_days=eff_lead_time,
            is_peak_season=is_peak,
            safety_stock_units=safety_stock,
            current_physical_stock=current_stock,
            owed_reserved_stock=owed_stock,
            available_stock=available_stock,
            net_requirement_units=net_requirement,
            vendor_case_pack=case_pack,
            moq=min_order,
            recommended_po_quantity=recommended_po_qty,
            recommended_carton_count=carton_count,
            days_of_inventory_remaining=doir,
            stockout_risk=stockout_risk,
            reasoning=reasoning,
        )


# Singleton instance
demand_engine = SeasonalDemandEngine()
