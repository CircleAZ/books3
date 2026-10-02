"""
The Toyota Production System (TPS) Andon Cord Engine — Books3 Data Intelligence Platform.
Implements Taiichi Ohno's Jidoka (Autonomation) principle:
An immutable circuit breaker that freezes automated replenishment and procurement pipelines
when volume variance (> 30%), price/cost variance (> 15%), or seasonal deadlines are breached.
"""

from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import date, datetime


class TPSAndonCordEngine:
    """
    Sovereign Failsafe Governance Engine.
    Intercepts algorithmic hallucinations, supplier billing errors, and unanchored volume spikes.
    """

    VOLUME_VARIANCE_THRESHOLD = 0.30       # +/- 30% volume variance
    COST_VARIANCE_THRESHOLD = 0.15         # +15% cost price hike
    MARGIN_DROP_THRESHOLD = 0.15           # 15 percentage points gross margin drop
    
    # Noise floors to avoid penny-alarms during off-season and long-tail retail
    MIN_VOLUME_DELTA_NOISE_FLOOR = 5       # Minimum 5 units delta to trip volume latch
    MIN_COST_DELTA_NOISE_FLOOR = 500.0     # Minimum ₹500 line cost delta to trip cost latch
    NEW_SKU_SAFE_TRIAL_LIMIT = 10         # Safe unanchored trial batch for new products

    STATUS_CLEARED = 'CLEARED'
    STATUS_TRIPPED = 'TRIPPED'
    STATUS_OVERRIDDEN = 'OVERRIDDEN'

    @classmethod
    def evaluate_line_item(
        cls,
        product_id: str,
        product_name: str,
        proposed_quantity: int,
        baseline_quantity: int = 0,
        proposed_unit_cost: float = 0.0,
        baseline_unit_cost: float = 0.0,
        selling_price: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Evaluates variance metrics for a single proposed purchase order line item.
        """
        tripped = False
        violations = []
        
        # 1. Volume Variance Evaluation
        volume_delta = proposed_quantity - baseline_quantity
        volume_var_pct = 0.0

        if baseline_quantity > 0:
            volume_var_pct = round((volume_delta / baseline_quantity) * 100.0, 2)
            # Trip latch if relative variance exceeds 30% AND absolute delta exceeds noise floor
            if abs(volume_var_pct) > (cls.VOLUME_VARIANCE_THRESHOLD * 100.0) and abs(volume_delta) >= cls.MIN_VOLUME_DELTA_NOISE_FLOOR:
                tripped = True
                sign = '+' if volume_delta > 0 else ''
                violations.append({
                    'type': 'VOLUME_VARIANCE',
                    'message': f"Volume variance {sign}{volume_var_pct}% ({proposed_quantity} vs baseline {baseline_quantity}) exceeds ±30% threshold."
                })
        else:
            # Baseline is 0 (Brand new product or zero prior purchases)
            if proposed_quantity > cls.NEW_SKU_SAFE_TRIAL_LIMIT:
                tripped = True
                violations.append({
                    'type': 'UNANCHORED_NEW_SKU',
                    'message': f"Unanchored new SKU: Proposed quantity of {proposed_quantity} units exceeds safe trial limit of {cls.NEW_SKU_SAFE_TRIAL_LIMIT} units."
                })

        # 2. Cost Variance Evaluation
        cost_delta = proposed_unit_cost - baseline_unit_cost
        cost_var_pct = 0.0
        line_cost_delta = cost_delta * proposed_quantity

        if baseline_unit_cost > 0.0:
            cost_var_pct = round((cost_delta / baseline_unit_cost) * 100.0, 2)
            # Trip latch if cost hike exceeds 15% AND line cost delta exceeds noise floor
            if cost_var_pct > (cls.COST_VARIANCE_THRESHOLD * 100.0) and line_cost_delta >= cls.MIN_COST_DELTA_NOISE_FLOOR:
                tripped = True
                violations.append({
                    'type': 'COST_HIKE',
                    'message': f"Unit cost hike +{cost_var_pct}% (₹{proposed_unit_cost:.2f} vs baseline ₹{baseline_unit_cost:.2f}) exceeds +15% threshold."
                })

        # 3. Margin Compression Evaluation
        if selling_price > 0.0 and proposed_unit_cost > 0.0:
            proposed_margin = (selling_price - proposed_unit_cost) / selling_price
            if baseline_unit_cost > 0.0:
                baseline_margin = (selling_price - baseline_unit_cost) / selling_price
                margin_drop = baseline_margin - proposed_margin
                line_profit_delta = margin_drop * selling_price * proposed_quantity
                if margin_drop > cls.MARGIN_DROP_THRESHOLD and line_profit_delta >= cls.MIN_COST_DELTA_NOISE_FLOOR:
                    tripped = True
                    violations.append({
                        'type': 'MARGIN_COMPRESSION',
                        'message': f"Gross margin compressed by {margin_drop * 100.0:.1f} percentage points ({proposed_margin * 100.0:.1f}% vs baseline {baseline_margin * 100.0:.1f}%)."
                    })

        return {
            'product_id': product_id,
            'product_name': product_name,
            'proposed_quantity': proposed_quantity,
            'baseline_quantity': baseline_quantity,
            'volume_delta': volume_delta,
            'volume_var_pct': volume_var_pct,
            'proposed_unit_cost': proposed_unit_cost,
            'baseline_unit_cost': baseline_unit_cost,
            'cost_var_pct': cost_var_pct,
            'is_tripped': tripped,
            'violations': violations
        }

    @classmethod
    def evaluate_pipeline_batch(
        cls,
        items: List[Dict[str, Any]],
        evaluation_date: Optional[date] = None,
        vendor_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates an entire proposed procurement cohort or transfer payload against TPS Andon rules.
        """
        eval_date = evaluation_date or date.today()
        line_evaluations = []
        offending_items = []
        trip_reasons = []

        is_tripped = False

        # 1. Seasonality & Late-Season Hard Stop Check
        # Hard cutoff: June 1st to June 15th before schools reopen in 2nd week of June
        is_late_season = (eval_date.month == 6 and 1 <= eval_date.day <= 15)
        total_units = sum(int(item.get('proposed_quantity', 1)) for item in items)

        if is_late_season and total_units >= 20:
            is_tripped = True
            reason = "LATE-SEASON INVENTORY RISK: Order created in early June (< 10 days before schools reopen). Restock carries severe dead-inventory hazard."
            trip_reasons.append(reason)

        # 2. Evaluate individual items
        for item in items:
            p_id = str(item.get('product_id', ''))
            p_name = str(item.get('product_name', 'Unknown Product'))
            prop_qty = int(item.get('proposed_quantity', 1))
            base_qty = int(item.get('baseline_quantity', 0))
            prop_cost = float(item.get('proposed_unit_cost', 0.0))
            base_cost = float(item.get('baseline_unit_cost', 0.0))
            sell_price = float(item.get('selling_price', 0.0))

            res = cls.evaluate_line_item(
                product_id=p_id,
                product_name=p_name,
                proposed_quantity=prop_qty,
                baseline_quantity=base_qty,
                proposed_unit_cost=prop_cost,
                baseline_unit_cost=base_cost,
                selling_price=sell_price
            )
            line_evaluations.append(res)

            if res['is_tripped']:
                is_tripped = True
                offending_items.append(res)
                for v in res['violations']:
                    trip_reasons.append(f"{p_name}: {v['message']}")

        status = cls.STATUS_TRIPPED if is_tripped else cls.STATUS_CLEARED

        action_required = (
            "HALT DISPATCH: TPS Andon Cord tripped. Review flagged variances and provide manager authorization override."
            if is_tripped
            else "Tolerances verified. Cleared for automated purchase order creation."
        )

        return {
            'andon_status': status,
            'is_tripped': is_tripped,
            'total_items_evaluated': len(items),
            'offending_items_count': len(offending_items),
            'trip_reasons': trip_reasons,
            'offending_items': offending_items,
            'evaluations': line_evaluations,
            'action_required': action_required,
            'evaluated_at': eval_date.isoformat(),
            'vendor_name': vendor_name,
        }
