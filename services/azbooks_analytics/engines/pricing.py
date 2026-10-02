"""
Engine 4: Dynamic Pricing & Margin Elasticity Simulator.
Log-Log Econometric Demand Regression, Empirical Bayesian Elasticity Shrinkage,
Theoretical Profit-Maximizing Price with Mechanical Governor Ceilings,
and What-If Price Scenario Simulation.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple, Union
import math
import logging

logger = logging.getLogger("azbooks.analytics.engines.pricing")


@dataclass
class PriceElasticityItem:
    product_id: str
    product_name: str
    category_name: str
    sample_size: int
    price_variance: float
    current_price: float
    unit_cost: float
    current_gross_margin_pct: float
    price_elasticity: float
    demand_classification: str  # "INELASTIC", "ELASTIC", "UNITARY"
    r_squared: float
    confidence_level: str  # "HIGH", "MODERATE", "LOW_SHRUNK"
    optimal_price: float
    recommended_price_change_pct: float
    recommended_action: str
    has_anomaly: bool
    anomaly_reason: str


@dataclass
class PriceSimulationItem:
    product_id: str
    product_name: str
    current_price: float
    proposed_price: float
    unit_cost: float
    price_change_pct: float
    price_elasticity: float
    baseline_volume: float
    projected_volume: float
    volume_change_pct: float
    baseline_revenue: float
    projected_revenue: float
    revenue_change_pct: float
    baseline_profit: float
    projected_profit: float
    profit_change_pct: float
    current_margin_pct: float
    projected_margin_pct: float
    andon_latch_tripped: bool
    verdict: str
    commercial_summary: str


class DynamicPricingEngine:
    """
    Econometric Pricing & Margin Elasticity Engine.
    Employs Log-Log regression with empirical Bayesian shrinkage against degenerate sample sets,
    enforcing mechanical governors against runaway price hikes or margin destruction.
    """

    # Default category baseline priors (fallback elasticity when price variance is 0 or N is small)
    DEFAULT_CATEGORY_PRIORS: Dict[str, float] = {
        "textbook": -0.65,      # Inelastic (syllabus mandated)
        "syllabus": -0.60,      # Inelastic
        "stationery": -1.25,    # Elastic (commodity competition)
        "notebook": -0.95,      # Near unitary
        "uniform": -0.70,       # Inelastic
        "general": -0.85,       # Baseline prior
    }

    def __init__(
        self,
        max_price_hike_pct: float = 0.15,   # +15% mechanical ceiling (TPS Andon Cord)
        max_price_drop_pct: float = 0.20,   # -20% mechanical floor
        min_gross_margin_pct: float = 0.05, # +5% minimum gross margin floor
        shrinkage_regularizer: float = 0.15, # Regularization constant for Bayesian shrinkage
    ):
        self.max_price_hike_pct = max(0.01, min(0.50, max_price_hike_pct))
        self.max_price_drop_pct = max(0.01, min(0.50, max_price_drop_pct))
        self.min_gross_margin_pct = max(0.01, min(0.30, min_gross_margin_pct))
        self.shrinkage_regularizer = max(0.001, shrinkage_regularizer)

    def get_category_prior(self, category_name: Optional[str]) -> float:
        """Determines baseline prior elasticity based on product category."""
        if not category_name:
            return self.DEFAULT_CATEGORY_PRIORS["general"]

        cat_clean = category_name.strip().lower()
        for key, prior in self.DEFAULT_CATEGORY_PRIORS.items():
            if key in cat_clean:
                return prior
        return self.DEFAULT_CATEGORY_PRIORS["general"]

    def compute_elasticity(
        self,
        prices: List[float],
        quantities: List[float],
        category_name: Optional[str] = None,
    ) -> Tuple[float, float, float, str, bool, str]:
        """
        Executes Log-Log Ordinary Least Squares (OLS) regression:
        ln(Q) = alpha + beta * ln(P) + epsilon
        Returns: (elasticity, r_squared, price_variance, confidence_level, has_anomaly, anomaly_reason)
        """
        prior_beta = self.get_category_prior(category_name)

        # Sanitize: filter out non-positive prices and quantities
        valid_pairs = [
            (float(p), float(q))
            for p, q in zip(prices, quantities)
            if p is not None and q is not None and float(p) > 0.0 and float(q) > 0.0
        ]

        n = len(valid_pairs)
        if n < 3:
            # Insufficient sample size -> 100% Bayesian shrinkage to prior
            return (
                prior_beta,
                0.0,
                0.0,
                "LOW_SHRUNK",
                False,
                f"Sample size {n} < 3; shrunk to category baseline prior ({prior_beta}).",
            )

        log_p = [math.log(p) for p, _ in valid_pairs]
        log_q = [math.log(q) for _, q in valid_pairs]

        mean_x = sum(log_p) / n
        mean_y = sum(log_q) / n

        var_x = sum((x - mean_x) ** 2 for x in log_p)
        var_y = sum((y - mean_y) ** 2 for y in log_q)
        cov_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(log_p, log_q))

        # Check for zero or near-zero price variation
        if var_x < 1e-6:
            return (
                prior_beta,
                0.0,
                0.0,
                "LOW_SHRUNK",
                False,
                f"Zero historical price variation; shrunk to category baseline prior ({prior_beta}).",
            )

        # Raw OLS slope: beta = Cov(x, y) / Var(x)
        raw_beta = cov_xy / var_x

        # R-squared computation
        if var_y > 1e-6:
            r_squared = (cov_xy ** 2) / (var_x * var_y)
            r_squared = min(1.0, max(0.0, r_squared))
        else:
            r_squared = 0.0

        # Detect Positive Elasticity Anomaly (e.g. rush-season confounding demand shift)
        has_anomaly = False
        anomaly_reason = ""
        if raw_beta > 0.0:
            has_anomaly = True
            anomaly_reason = (
                f"Observed positive regression slope ({round(raw_beta, 3)}) indicates seasonal "
                f"demand confounding; clamped to downward-sloping prior."
            )
            raw_beta = min(-0.15, prior_beta)

        # Empirical Bayesian Shrinkage weight
        # w in [0.0, 1.0]: Higher variance (SS_x) gives more weight to raw OLS
        weight = var_x / (var_x + self.shrinkage_regularizer)
        effective_elasticity = (weight * raw_beta) + ((1.0 - weight) * prior_beta)
        effective_elasticity = round(effective_elasticity, 4)

        if weight >= 0.70 and r_squared >= 0.35:
            confidence = "HIGH"
        elif weight >= 0.40:
            confidence = "MODERATE"
        else:
            confidence = "LOW_SHRUNK"

        return (
            effective_elasticity,
            round(r_squared, 4),
            round(var_x / n, 6),
            confidence,
            has_anomaly,
            anomaly_reason,
        )

    def calculate_optimal_price(
        self,
        current_price: float,
        unit_cost: float,
        elasticity: float,
        mrp: Optional[float] = None,
    ) -> Tuple[float, float, str]:
        """
        Calculates theoretical optimal price and applies mechanical governors.
        Returns: (optimal_price, recommended_price_change_pct, reasoning)
        """
        cost = max(0.01, unit_cost)
        curr_p = max(0.01, current_price)

        # Minimum Price Floor: Cost + 5% gross margin, and at most max_price_drop_pct
        min_allowed_price = max(cost / (1.0 - self.min_gross_margin_pct), curr_p * (1.0 - self.max_price_drop_pct))

        # Maximum Price Ceiling: At most max_price_hike_pct (+15%), capped by MRP if provided
        max_allowed_price = curr_p * (1.0 + self.max_price_hike_pct)
        if mrp is not None and mrp > 0:
            max_allowed_price = min(max_allowed_price, mrp)

        # Economic optimal price calculation:
        # If elastic (beta < -1): P* = Cost * (beta / (1 + beta))
        # If inelastic (beta >= -1): Unconstrained math goes to infinity; clamped to mechanical ceiling.
        if elasticity < -1.05:
            theoretical_p = cost * (elasticity / (1.0 + elasticity))
            reasoning = f"Elastic demand (e = {elasticity}): optimal price maximizes profit margin."
        elif elasticity >= -1.05 and elasticity <= -0.95:
            theoretical_p = curr_p
            reasoning = f"Unitary demand (e = {elasticity}): current price is balanced."
        else:
            # Inelastic: Raising price expands net margin with minimal volume attrition
            theoretical_p = max_allowed_price
            reasoning = f"Inelastic demand (e = {elasticity}): modest price hike expands net margin."

        # Apply Hard Mechanical Stops (Governors)
        clamped_p = min(max_allowed_price, max(min_allowed_price, theoretical_p))
        clamped_p = round(clamped_p, 2)

        change_pct = round(((clamped_p - curr_p) / curr_p) * 100.0, 2)
        return clamped_p, change_pct, reasoning

    def analyze_product(
        self,
        product_id: str,
        product_name: str,
        current_price: float,
        unit_cost: float,
        prices: List[float],
        quantities: List[float],
        category_name: Optional[str] = None,
        mrp: Optional[float] = None,
    ) -> PriceElasticityItem:
        """Analyzes a single product's pricing data, elasticity, and optimal price point."""
        cost = max(0.01, unit_cost)
        curr_p = max(0.01, current_price)
        cat_name = category_name or "General"

        curr_margin_pct = round(((curr_p - cost) / curr_p) * 100.0, 2)

        elasticity, r2, p_var, conf, has_ano, ano_reason = self.compute_elasticity(
            prices=prices,
            quantities=quantities,
            category_name=cat_name,
        )

        # Classify demand
        if elasticity < -1.05:
            classification = "ELASTIC"
        elif elasticity > -0.95:
            classification = "INELASTIC"
        else:
            classification = "UNITARY"

        optimal_p, change_pct, reason = self.calculate_optimal_price(
            current_price=curr_p,
            unit_cost=cost,
            elasticity=elasticity,
            mrp=mrp,
        )

        if change_pct > 0.5:
            action = f"INCREASE_PRICE (+{change_pct}%): {reason}"
        elif change_pct < -0.5:
            action = f"DECREASE_PRICE ({change_pct}%): {reason}"
        else:
            action = f"MAINTAIN_PRICE: Current price ₹{curr_p} is at optimal yield."

        return PriceElasticityItem(
            product_id=product_id,
            product_name=product_name,
            category_name=cat_name,
            sample_size=len(prices),
            price_variance=p_var,
            current_price=curr_p,
            unit_cost=cost,
            current_gross_margin_pct=curr_margin_pct,
            price_elasticity=elasticity,
            demand_classification=classification,
            r_squared=r2,
            confidence_level=conf,
            optimal_price=optimal_p,
            recommended_price_change_pct=change_pct,
            recommended_action=action,
            has_anomaly=has_ano,
            anomaly_reason=ano_reason,
        )

    def simulate_price_change(
        self,
        product_id: str,
        product_name: str,
        current_price: float,
        proposed_price: float,
        unit_cost: float,
        baseline_volume: float,
        elasticity: float,
    ) -> PriceSimulationItem:
        """
        Simulates what happens to volume, revenue, profit, and gross margin
        if proposed price is implemented.
        """
        p0 = max(0.01, float(current_price))
        p1 = max(0.01, float(proposed_price))
        cost = max(0.01, float(unit_cost))
        q0 = max(1.0, float(baseline_volume))
        e = float(elasticity)

        # Price Change %
        price_change_pct = ((p1 - p0) / p0) * 100.0

        # Projected volume: Q1 = Q0 * (P1 / P0)^e
        if p1 == p0:
            q1 = q0
        else:
            ratio = p1 / p0
            q1 = q0 * (ratio ** e)
            q1 = max(0.0, q1)

        vol_change_pct = ((q1 - q0) / q0) * 100.0

        # Financial Projections
        rev0 = p0 * q0
        rev1 = p1 * q1
        rev_change_pct = ((rev1 - rev0) / max(1.0, rev0)) * 100.0

        profit0 = (p0 - cost) * q0
        profit1 = (p1 - cost) * q1
        safe_profit0 = max(1.0, abs(profit0))
        profit_change_pct = ((profit1 - profit0) / safe_profit0) * 100.0

        margin0 = ((p0 - cost) / p0) * 100.0
        margin1 = ((p1 - cost) / p1) * 100.0

        # Andon Latch Condition (TPS): Trips if price hike > 15%, drop > 20%, or volume drop > 30%
        andon_tripped = (
            price_change_pct > (self.max_price_hike_pct * 100.0)
            or price_change_pct < (-self.max_price_drop_pct * 100.0)
            or vol_change_pct < -30.0
            or margin1 < (self.min_gross_margin_pct * 100.0)
        )

        # Verdict
        if margin1 < (self.min_gross_margin_pct * 100.0):
            verdict = "WARNING_MARGIN_COLLAPSE"
            summary = (
                f"Proposed price ₹{p1} yields {round(margin1, 1)}% gross margin, "
                f"violating the 5% margin safety floor."
            )
        elif andon_tripped:
            verdict = "ANDON_LATCH_TRIPPED"
            summary = (
                f"⚠️ Andon Cord tripped: Price delta {round(price_change_pct, 1)}% or volume delta "
                f"{round(vol_change_pct, 1)}% exceeds organizational threshold. Requires executive authorization."
            )
        elif profit1 > profit0:
            verdict = "OPTIMAL_EXPANSION"
            summary = (
                f"Positive yield: Profit expands by +{round(profit_change_pct, 1)}% "
                f"(+₹{round(profit1 - profit0, 2)}) with volume delta {round(vol_change_pct, 1)}%."
            )
        else:
            verdict = "MARGIN_COMPRESSION"
            summary = (
                f"Unfavorable shift: Net profit declines by {round(profit_change_pct, 1)}% "
                f"(-₹{round(profit0 - profit1, 2)})."
            )

        return PriceSimulationItem(
            product_id=product_id,
            product_name=product_name,
            current_price=round(p0, 2),
            proposed_price=round(p1, 2),
            unit_cost=round(cost, 2),
            price_change_pct=round(price_change_pct, 2),
            price_elasticity=round(e, 4),
            baseline_volume=round(q0, 2),
            projected_volume=round(q1, 2),
            volume_change_pct=round(vol_change_pct, 2),
            baseline_revenue=round(rev0, 2),
            projected_revenue=round(rev1, 2),
            revenue_change_pct=round(rev_change_pct, 2),
            baseline_profit=round(profit0, 2),
            projected_profit=round(profit1, 2),
            profit_change_pct=round(profit_change_pct, 2),
            current_margin_pct=round(margin0, 2),
            projected_margin_pct=round(margin1, 2),
            andon_latch_tripped=andon_tripped,
            verdict=verdict,
            commercial_summary=summary,
        )


# Singleton instance
pricing_engine = DynamicPricingEngine()
