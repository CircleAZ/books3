from __future__ import annotations

"""
Engine 5: Product Quality & Customer Dissatisfaction Radar.
Bayesian Laplace-Smoothed Defect Rate, Strict Consignment Unsold Segregation,
Vendor Quality Scorecard with PO Freeze Recommendation,
and Customer Churn Risk Cluster Extraction.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple, Union, Set
import logging
try:
    import polars as pl
except ImportError:
    class _MockPolars:
        class DataFrame: pass
        class LazyFrame: pass
        class Expr: pass
        class Series: pass
    pl = _MockPolars()

logger = logging.getLogger("azbooks.analytics.engines.defects")


@dataclass
class ProductDefectItem:
    product_id: str
    product_name: str
    category_name: str
    vendor_id: str
    vendor_name: str
    units_sold: int
    physical_defect_returns: int
    consignment_unsold_returns: int
    commercial_other_returns: int
    total_returns: int
    raw_defect_rate_pct: float
    bayesian_defect_rate_pct: float
    consignment_return_rate_pct: float
    quality_status: str  # "EXCELLENT", "ACCEPTABLE", "ELEVATED_DEFECTS", "CRITICAL_DEFECTS"
    primary_defect_reason: str
    recommended_action: str


@dataclass
class VendorScorecardItem:
    vendor_id: str
    vendor_name: str
    total_units_sold: int
    total_physical_defects: int
    total_consignment_unsold: int
    bayesian_defect_density_pct: float
    vendor_quality_grade: str  # "EXCELLENT", "ACCEPTABLE", "ELEVATED_DEFECTS", "CRITICAL_PO_FREEZE"
    po_freeze_recommended: bool
    top_defective_products: List[Dict[str, Any]]
    recommended_procurement_action: str


@dataclass
class DissatisfiedCustomerItem:
    customer_id: str
    customer_name: str
    phone: str
    village_name: str
    total_orders: int
    total_units_purchased: int
    defective_items_returned: int
    total_refund_amount: float
    defect_encounter_rate_pct: float
    churn_risk_level: str  # "CRITICAL", "HIGH", "MODERATE"
    recommended_retention_action: str


class QualityDefectRadarEngine:
    """
    High-precision Quality Defect & Dissatisfaction Radar.
    Strictly isolates physical manufacturing defects from unsold consignment returns,
    applying Bayesian Laplace smoothing (alpha=1.0, beta=99.0) against small-sample bias.
    """

    # Physical Defect Reason Tokens (Trigger Bayesian Defect Density Calculation)
    PHYSICAL_DEFECT_KEYWORDS: Set[str] = {
        "damaged",
        "defective",
        "binding_failure",
        "binding",
        "misprint",
        "print_error",
        "wrong_contents",
        "pages_missing",
        "quality_issue",
        "broken",
        "torn",
        "stain",
        "ink_leak",
    }

    # Consignment / Overstock / Remorse Return Tokens (Strictly Excluded from Quality Defect Rate)
    CONSIGNMENT_UNSOLD_KEYWORDS: Set[str] = {
        "consignment_unsold",
        "consignment",
        "unsold",
        "term_end",
        "end_of_term",
        "school_unsold",
    }

    COMMERCIAL_REMORSE_KEYWORDS: Set[str] = {
        "changed_mind",
        "duplicate_order",
        "duplicate",
        "not_as_described",
        "wrong_quantity",
        "wrong_item",
        "expired",
        "old_edition",
    }

    def __init__(
        self,
        alpha: float = 1.0,       # Bayesian prior defect pseudo-count
        beta: float = 99.0,       # Bayesian prior normal pseudo-count (1.0% prior expectation)
        po_freeze_threshold: float = 6.0,  # Defect density % threshold to trigger PO freeze
        min_defects_for_freeze: int = 5,   # Minimum absolute defects to avoid small-scale PO freeze
    ):
        self.alpha = max(0.1, alpha)
        self.beta = max(1.0, beta)
        self.po_freeze_threshold = max(2.0, po_freeze_threshold)
        self.min_defects_for_freeze = max(1, min_defects_for_freeze)

    def classify_return_reason(self, reason_str: Optional[str]) -> str:
        """
        Classifies return reason into:
          - 'PHYSICAL_DEFECT'
          - 'CONSIGNMENT_UNSOLD'
          - 'COMMERCIAL_OTHER'
        """
        if not reason_str:
            return "COMMERCIAL_OTHER"

        clean = reason_str.strip().lower().replace(" ", "_").replace("-", "_")

        for kw in self.PHYSICAL_DEFECT_KEYWORDS:
            if kw in clean:
                return "PHYSICAL_DEFECT"

        for kw in self.CONSIGNMENT_UNSOLD_KEYWORDS:
            if kw in clean:
                return "CONSIGNMENT_UNSOLD"

        return "COMMERCIAL_OTHER"

    def compute_bayesian_defect_rate(self, defect_count: int, total_sold: int) -> float:
        """
        Computes Bayesian smoothed defect rate:
        theta = (defects + alpha) / (sold + alpha + beta)
        """
        k = max(0, defect_count)
        n = max(0, total_sold)
        rate = (k + self.alpha) / (n + self.alpha + self.beta)
        return round(rate * 100.0, 2)

    def analyze_products(
        self,
        sales_records: Union[List[Dict[str, Any]], pl.DataFrame],
        return_records: Union[List[Dict[str, Any]], pl.DataFrame],
    ) -> List[ProductDefectItem]:
        """
        Evaluates Bayesian defect rates across all products with strict consignment return segregation.
        """
        if not isinstance(sales_records, pl.DataFrame):
            df_sales = pl.DataFrame(sales_records) if sales_records else pl.DataFrame()
        else:
            df_sales = sales_records

        if not isinstance(return_records, pl.DataFrame):
            df_returns = pl.DataFrame(return_records) if return_records else pl.DataFrame()
        else:
            df_returns = return_records

        # Aggregate total units sold by product
        product_sales_map: Dict[str, Dict[str, Any]] = {}
        if not df_sales.is_empty():
            # Standardize sales columns
            sales_cols = df_sales.columns
            if "product_id" in sales_cols and "quantity" in sales_cols:
                for row in df_sales.iter_rows(named=True):
                    pid = str(row["product_id"])
                    qty = int(row["quantity"] or 0)
                    if pid not in product_sales_map:
                        product_sales_map[pid] = {
                            "product_name": str(row.get("product_name") or pid),
                            "category_name": str(row.get("category_name") or "General"),
                            "vendor_id": str(row.get("vendor_id") or "unassigned"),
                            "vendor_name": str(row.get("vendor_name") or "Unassigned Vendor"),
                            "units_sold": 0,
                        }
                    product_sales_map[pid]["units_sold"] += qty

        # Aggregate returns by category
        product_returns_map: Dict[str, Dict[str, Any]] = {}
        if not df_returns.is_empty():
            for row in df_returns.iter_rows(named=True):
                pid = str(row["product_id"])
                qty = int(row.get("quantity") or 1)
                reason_raw = str(row.get("reason") or "Damaged")
                r_type = self.classify_return_reason(reason_raw)

                if pid not in product_returns_map:
                    product_returns_map[pid] = {
                        "product_name": str(row.get("product_name") or pid),
                        "category_name": str(row.get("category_name") or "General"),
                        "vendor_id": str(row.get("vendor_id") or "unassigned"),
                        "vendor_name": str(row.get("vendor_name") or "Unassigned Vendor"),
                        "physical_defects": 0,
                        "consignment_unsold": 0,
                        "commercial_other": 0,
                        "reasons_count": {},
                    }

                if r_type == "PHYSICAL_DEFECT":
                    product_returns_map[pid]["physical_defects"] += qty
                    # track primary defect reason
                    rc = product_returns_map[pid]["reasons_count"]
                    rc[reason_raw] = rc.get(reason_raw, 0) + qty
                elif r_type == "CONSIGNMENT_UNSOLD":
                    product_returns_map[pid]["consignment_unsold"] += qty
                else:
                    product_returns_map[pid]["commercial_other"] += qty

        # Merge all products
        all_product_ids = set(product_sales_map.keys()).union(set(product_returns_map.keys()))
        results: List[ProductDefectItem] = []

        for pid in all_product_ids:
            sales_info = product_sales_map.get(pid, {})
            returns_info = product_returns_map.get(pid, {})

            pname = sales_info.get("product_name") or returns_info.get("product_name") or pid
            cat_name = sales_info.get("category_name") or returns_info.get("category_name") or "General"
            vid = sales_info.get("vendor_id") or returns_info.get("vendor_id") or "unassigned"
            vname = sales_info.get("vendor_name") or returns_info.get("vendor_name") or "Unassigned Vendor"

            units_sold = sales_info.get("units_sold", 0)
            phys_defects = returns_info.get("physical_defects", 0)
            cons_unsold = returns_info.get("consignment_unsold", 0)
            comm_other = returns_info.get("commercial_other", 0)
            total_returns = phys_defects + cons_unsold + comm_other

            # Raw defect rate vs Bayesian smoothed rate
            raw_rate = (phys_defects / max(1, units_sold)) * 100.0 if units_sold > 0 else 0.0
            bayesian_rate = self.compute_bayesian_defect_rate(phys_defects, units_sold)
            cons_rate = (cons_unsold / max(1, units_sold)) * 100.0 if units_sold > 0 else 0.0

            # Determine primary physical defect reason
            reasons_dict = returns_info.get("reasons_count", {})
            if reasons_dict:
                top_reason = max(reasons_dict.items(), key=lambda x: x[1])[0]
            else:
                top_reason = "N/A"

            # Grade product quality
            if bayesian_rate > 5.0 and phys_defects >= 3:
                status = "CRITICAL_DEFECTS"
                action = f"CRITICAL: Defect rate {bayesian_rate}% exceeds 5% threshold ({top_reason}). Quarantine batch."
            elif bayesian_rate > 3.0:
                status = "ELEVATED_DEFECTS"
                action = f"WARNING: Elevated defect density ({bayesian_rate}%). Request supplier inspection."
            elif bayesian_rate > 1.5:
                status = "ACCEPTABLE"
                action = "ACCEPTABLE: Normal operating defect range."
            else:
                status = "EXCELLENT"
                action = "EXCELLENT: Superior product build quality."

            results.append(
                ProductDefectItem(
                    product_id=pid,
                    product_name=pname,
                    category_name=cat_name,
                    vendor_id=vid,
                    vendor_name=vname,
                    units_sold=units_sold,
                    physical_defect_returns=phys_defects,
                    consignment_unsold_returns=cons_unsold,
                    commercial_other_returns=comm_other,
                    total_returns=total_returns,
                    raw_defect_rate_pct=round(raw_rate, 2),
                    bayesian_defect_rate_pct=bayesian_rate,
                    consignment_return_rate_pct=round(cons_rate, 2),
                    quality_status=status,
                    primary_defect_reason=top_reason,
                    recommended_action=action,
                )
            )

        # Sort highest Bayesian defect rate first
        results.sort(key=lambda x: x.bayesian_defect_rate_pct, reverse=True)
        return results

    def analyze_vendors(
        self,
        sales_records: Union[List[Dict[str, Any]], pl.DataFrame],
        return_records: Union[List[Dict[str, Any]], pl.DataFrame],
    ) -> List[VendorScorecardItem]:
        """
        Evaluates Bayesian defect density per vendor and recommends PO freezes if thresholds trip.
        """
        product_items = self.analyze_products(sales_records, return_records)

        vendor_groups: Dict[str, Dict[str, Any]] = {}
        for p in product_items:
            vid = p.vendor_id
            if vid not in vendor_groups:
                vendor_groups[vid] = {
                    "vendor_name": p.vendor_name,
                    "units_sold": 0,
                    "defects": 0,
                    "consignment_unsold": 0,
                    "products": [],
                }
            vg = vendor_groups[vid]
            vg["units_sold"] += p.units_sold
            vg["defects"] += p.physical_defect_returns
            vg["consignment_unsold"] += p.consignment_unsold_returns
            vg["products"].append(p)

        scorecards: List[VendorScorecardItem] = []
        for vid, data in vendor_groups.items():
            tot_sold = data["units_sold"]
            tot_defects = data["defects"]
            cons_unsold = data["consignment_unsold"]

            density = self.compute_bayesian_defect_rate(tot_defects, tot_sold)

            # Check PO freeze criteria: density > threshold AND absolute defects >= min_defects_for_freeze
            freeze_po = (density >= self.po_freeze_threshold) and (tot_defects >= self.min_defects_for_freeze)

            if freeze_po:
                grade = "CRITICAL_PO_FREEZE"
                rec_action = (
                    f"⛔ FREEZE PO CREATION: Vendor defect density is {density}% "
                    f"({tot_defects} defective items). Halt new purchase orders pending factory audit."
                )
            elif density > 3.5:
                grade = "ELEVATED_DEFECTS"
                rec_action = f"WARNING: Defect density {density}%. Issue formal vendor cure notice."
            elif density > 1.5:
                grade = "ACCEPTABLE"
                rec_action = "Standard fulfillment: Defect density within acceptable industry tolerance."
            else:
                grade = "EXCELLENT"
                rec_action = "Preferred Tier: Flawless quality record."

            # Top defective products under this vendor
            defective_prods = [
                {
                    "product_id": prod.product_id,
                    "product_name": prod.product_name,
                    "defects": prod.physical_defect_returns,
                    "defect_rate_pct": prod.bayesian_defect_rate_pct,
                    "primary_reason": prod.primary_defect_reason,
                }
                for prod in data["products"]
                if prod.physical_defect_returns > 0
            ]
            defective_prods.sort(key=lambda x: x["defects"], reverse=True)

            scorecards.append(
                VendorScorecardItem(
                    vendor_id=vid,
                    vendor_name=data["vendor_name"],
                    total_units_sold=tot_sold,
                    total_physical_defects=tot_defects,
                    total_consignment_unsold=cons_unsold,
                    bayesian_defect_density_pct=density,
                    vendor_quality_grade=grade,
                    po_freeze_recommended=freeze_po,
                    top_defective_products=defective_prods[:5],
                    recommended_procurement_action=rec_action,
                )
            )

        # Sort worst vendors first (highest defect density)
        scorecards.sort(key=lambda x: x.bayesian_defect_density_pct, reverse=True)
        return scorecards

    def extract_dissatisfied_customers(
        self,
        sales_records: Union[List[Dict[str, Any]], pl.DataFrame],
        return_records: Union[List[Dict[str, Any]], pl.DataFrame],
        min_defective_items: int = 2,
    ) -> List[DissatisfiedCustomerItem]:
        """
        Extracts customer accounts affected by physical defect returns for retention intervention.
        """
        if not isinstance(return_records, pl.DataFrame):
            df_returns = pl.DataFrame(return_records) if return_records else pl.DataFrame()
        else:
            df_returns = return_records

        if df_returns.is_empty():
            return []

        # Filter only physical defect returns with customer info
        customer_defects_map: Dict[str, Dict[str, Any]] = {}
        for row in df_returns.iter_rows(named=True):
            cid = str(row.get("customer_id") or "")
            if not cid or cid == "None" or cid == "unassigned":
                continue

            reason_raw = str(row.get("reason") or "")
            if self.classify_return_reason(reason_raw) != "PHYSICAL_DEFECT":
                continue

            qty = int(row.get("quantity") or 1)
            refund = float(row.get("refund_amount") or 0.0)

            if cid not in customer_defects_map:
                customer_defects_map[cid] = {
                    "customer_name": str(row.get("customer_name") or "Valued Customer"),
                    "phone": str(row.get("phone") or ""),
                    "village_name": str(row.get("village_name") or "Unmapped"),
                    "defective_items": 0,
                    "refund_sum": 0.0,
                    "orders_count": 0,
                    "units_bought": 0,
                }
            cm = customer_defects_map[cid]
            cm["defective_items"] += qty
            cm["refund_sum"] += refund

        # Merge purchase volume from sales if available
        if not isinstance(sales_records, pl.DataFrame):
            df_sales = pl.DataFrame(sales_records) if sales_records else pl.DataFrame()
        else:
            df_sales = sales_records

        if not df_sales.is_empty() and "customer_id" in df_sales.columns:
            for row in df_sales.iter_rows(named=True):
                cid = str(row.get("customer_id") or "")
                if cid in customer_defects_map:
                    customer_defects_map[cid]["units_bought"] += int(row.get("quantity") or 1)
                    customer_defects_map[cid]["orders_count"] += 1

        results: List[DissatisfiedCustomerItem] = []
        for cid, data in customer_defects_map.items():
            defects = data["defective_items"]
            if defects < min_defective_items:
                continue

            bought = max(defects, data["units_bought"])
            encounter_rate = round((defects / max(1, bought)) * 100.0, 2)

            # Churn risk grading
            if defects >= 4 or encounter_rate > 25.0:
                risk = "CRITICAL"
                retention = "URGENT: Proactive store manager phone call + ₹500 courtesy credit."
            elif defects >= 2:
                risk = "HIGH"
                retention = "HIGH: Automated WhatsApp apology + free replacement kit on next order."
            else:
                risk = "MODERATE"
                retention = "MODERATE: Standard refund follow-up."

            results.append(
                DissatisfiedCustomerItem(
                    customer_id=cid,
                    customer_name=data["customer_name"],
                    phone=data["phone"],
                    village_name=data["village_name"],
                    total_orders=max(1, data["orders_count"]),
                    total_units_purchased=bought,
                    defective_items_returned=defects,
                    total_refund_amount=round(data["refund_sum"], 2),
                    defect_encounter_rate_pct=encounter_rate,
                    churn_risk_level=risk,
                    recommended_retention_action=retention,
                )
            )

        # Sort most dissatisfied customers first (highest defect count)
        results.sort(key=lambda x: x.defective_items_returned, reverse=True)
        return results


# Singleton instance
defect_engine = QualityDefectRadarEngine()
