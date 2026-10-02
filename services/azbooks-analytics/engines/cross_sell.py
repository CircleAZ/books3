"""
Engine 1: Market Basket & Cross-Selling Engine.
High-velocity vectorized itemset mining and association rule generation with
inverse propensity attribution de-biasing and customer gap extraction.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import polars as pl


@dataclass
class AssociationRule:
    antecedent_ids: List[str]
    antecedent_names: List[str]
    consequent_id: str
    consequent_name: str
    support: float
    confidence: float
    lift: float
    conviction: float
    co_occurrence_count: int
    organic_co_occurrence_count: int
    prompted_co_occurrence_count: int
    pitch_script: str


@dataclass
class CustomerGapCohort:
    antecedent_ids: List[str]
    consequent_id: str
    consequent_name: str
    consequent_price: float
    total_target_customers: int
    estimated_incremental_revenue: float
    customers: List[Dict[str, Any]]


class CrossSellEngine:
    """
    High-performance, bounded market basket affinity engine.
    Designed with mechanical governors against unbounded combinatorial explosions.
    """

    def __init__(
        self,
        min_support: float = 0.01,
        min_confidence: float = 0.10,
        min_lift: float = 1.05,
        max_antecedents: int = 2,
        recommendation_weight: float = 0.25,
    ):
        # Clamped parameters (mechanical governor)
        self.min_support = max(0.001, min_support)
        self.min_confidence = max(0.01, min_confidence)
        self.min_lift = max(1.0, min_lift)
        self.max_antecedents = min(2, max(1, max_antecedents))
        self.recommendation_weight = max(0.05, min(1.0, recommendation_weight))

    def analyze(
        self,
        transactions_df: pl.DataFrame,
        limit_rules: int = 50,
    ) -> List[AssociationRule]:
        """
        Computes de-biased association rules from an order items transaction DataFrame.
        Expected schema:
          - order_id: str | int
          - product_id: str | int
          - product_name: str
          - attribution_source: str ('organic' | 'recommendation', optional)
        """
        if transactions_df.is_empty():
            return []

        # 1. Normalize schema and inject attribution weights
        df = transactions_df.select([
            pl.col("order_id").cast(pl.Utf8),
            pl.col("product_id").cast(pl.Utf8),
            pl.col("product_name").cast(pl.Utf8),
            (
                pl.col("attribution_source")
                if "attribution_source" in transactions_df.columns
                else pl.lit("organic")
            ).alias("attribution_source"),
        ])

        # Assign inverse propensity weight
        df = df.with_columns([
            pl.when(pl.col("attribution_source") == "recommendation")
            .then(pl.lit(self.recommendation_weight))
            .otherwise(pl.lit(1.0))
            .alias("weight")
        ])

        # Group by order and product to collapse multiple line entries of the same item
        order_items = df.group_by(["order_id", "product_id", "product_name"]).agg([
            pl.col("weight").min().alias("item_weight"),
            (pl.col("attribution_source") == "recommendation").any().alias("is_prompted"),
        ])

        # Determine total distinct orders and total weighted transactions
        total_orders = order_items.select("order_id").n_unique()
        if total_orders < 2:
            return []

        # Total transaction weight (denominator for support)
        total_weight = (
            order_items.group_by("order_id")
            .agg(pl.col("item_weight").min())
            .select(pl.sum("item_weight"))
            .item()
        )
        if total_weight <= 0:
            total_weight = float(total_orders)

        # 2. Frequent 1-itemsets: Support(i) = sum(w_i) / total_weight
        item_stats = order_items.group_by(["product_id", "product_name"]).agg([
            pl.len().alias("raw_freq"),
            pl.col("item_weight").sum().alias("weighted_freq"),
        ]).with_columns([
            (pl.col("weighted_freq") / total_weight).alias("support")
        ])

        # Apply minimum support filter for candidate items
        frequent_items = item_stats.filter(pl.col("support") >= self.min_support)
        frequent_ids = set(frequent_items["product_id"].to_list())
        if len(frequent_ids) < 2:
            return []

        # Filter order_items to frequent items only
        scoped_items = order_items.filter(pl.col("product_id").is_in(frequent_ids))

        # Filter out single-item orders to avoid redundant join Cartesian products
        orders_with_pairs = (
            scoped_items.group_by("order_id")
            .agg(pl.len().alias("cnt"))
            .filter(pl.col("cnt") >= 2)
            .select("order_id")
        )
        scoped_items = scoped_items.join(orders_with_pairs, on="order_id", how="inner")
        if scoped_items.is_empty():
            return []

        # Create item lookup dictionary for fast metadata retrieval
        item_lookup = {
            row["product_id"]: {
                "name": row["product_name"],
                "support": row["support"],
                "raw_freq": row["raw_freq"],
            }
            for row in frequent_items.to_dicts()
        }

        # 3. Frequent 2-Itemsets via self-join (A != B)
        # We join on order_id to discover co-occurrences
        left = scoped_items.select([
            pl.col("order_id"),
            pl.col("product_id").alias("item_a"),
            pl.col("item_weight").alias("weight_a"),
            pl.col("is_prompted").alias("prompted_a"),
        ])
        right = scoped_items.select([
            pl.col("order_id"),
            pl.col("product_id").alias("item_b"),
            pl.col("item_weight").alias("weight_b"),
            pl.col("is_prompted").alias("prompted_b"),
        ])

        pairs = left.join(right, on="order_id").filter(pl.col("item_a") != pl.col("item_b"))

        # Pair weight is min(w_A, w_B)
        pairs = pairs.with_columns([
            pl.when(pl.col("weight_a") < pl.col("weight_b"))
            .then(pl.col("weight_a"))
            .otherwise(pl.col("weight_b"))
            .alias("pair_weight"),
            (pl.col("prompted_a") | pl.col("prompted_b")).alias("is_pair_prompted"),
        ])

        pair_stats = pairs.group_by(["item_a", "item_b"]).agg([
            pl.len().alias("co_occurrence_count"),
            pl.col("pair_weight").sum().alias("weighted_co_occurrence"),
            (pl.col("is_pair_prompted") == False).sum().alias("organic_co_occurrence_count"),
            (pl.col("is_pair_prompted") == True).sum().alias("prompted_co_occurrence_count"),
        ]).with_columns([
            (pl.col("weighted_co_occurrence") / total_weight).alias("pair_support")
        ])

        # Filter pairs meeting min_support
        valid_pairs = pair_stats.filter(pl.col("pair_support") >= self.min_support)
        if valid_pairs.is_empty():
            return []

        # 4. Generate Rules A -> B
        rules: List[AssociationRule] = []

        for row in valid_pairs.to_dicts():
            item_a = row["item_a"]
            item_b = row["item_b"]

            supp_ab = row["pair_support"]
            supp_a = item_lookup[item_a]["support"]
            supp_b = item_lookup[item_b]["support"]

            if supp_a <= 0 or supp_b <= 0:
                continue

            confidence = supp_ab / supp_a
            lift = confidence / supp_b

            # Conviction: (1 - supp_b) / (1 - confidence + eps)
            denom = 1.0 - confidence
            conviction = (1.0 - supp_b) / denom if denom > 1e-6 else 999.0

            if confidence >= self.min_confidence and lift >= self.min_lift:
                name_a = item_lookup[item_a]["name"]
                name_b = item_lookup[item_b]["name"]

                conf_pct = round(confidence * 100, 1)
                lift_val = round(lift, 2)
                pitch = f"Customers purchasing '{name_a}' also buy '{name_b}' {conf_pct}% of the time ({lift_val}x average)."

                rules.append(AssociationRule(
                    antecedent_ids=[item_a],
                    antecedent_names=[name_a],
                    consequent_id=item_b,
                    consequent_name=name_b,
                    support=round(supp_ab, 4),
                    confidence=round(confidence, 4),
                    lift=round(lift, 3),
                    conviction=round(conviction, 3),
                    co_occurrence_count=int(row["co_occurrence_count"]),
                    organic_co_occurrence_count=int(row["organic_co_occurrence_count"]),
                    prompted_co_occurrence_count=int(row["prompted_co_occurrence_count"]),
                    pitch_script=pitch,
                ))

        # 5. Triplet itemsets if max_antecedents >= 2
        if self.max_antecedents >= 2 and len(frequent_ids) >= 3:
            triplet_rules = self._mine_triplets(
                scoped_items,
                valid_pairs,
                item_lookup,
                total_weight,
            )
            rules.extend(triplet_rules)

        # Sort rules strictly by Lift descending, then Confidence descending
        rules.sort(key=lambda r: (r.lift, r.confidence), reverse=True)
        return rules[:limit_rules]

    def _mine_triplets(
        self,
        scoped_items: pl.DataFrame,
        valid_pairs: pl.DataFrame,
        item_lookup: Dict[str, Any],
        total_weight: float,
    ) -> List[AssociationRule]:
        """
        Bounded candidate generation for 2-item antecedents: (A1, A2) -> B.
        Clamped to maintain sub-50ms execution times.
        """
        # Get top 20 candidate pairs by support to avoid combinatorial explosion
        top_pairs = valid_pairs.sort("pair_support", descending=True).head(40)
        top_pair_tuples = set((r["item_a"], r["item_b"]) for r in top_pairs.to_dicts())

        # Join items: pair (A1, A2) where A1 < A2, joined with B (B != A1, B != A2)
        pair_table = top_pairs.filter(pl.col("item_a") < pl.col("item_b")).select([
            pl.col("item_a"),
            pl.col("item_b"),
            pl.col("pair_support").alias("supp_a1_a2"),
        ])

        # Self join with scoped items to find orders containing A1, A2, and B
        triplet_df = (
            scoped_items.select(["order_id", pl.col("product_id").alias("item_a1")])
            .join(
                scoped_items.select(["order_id", pl.col("product_id").alias("item_a2")]),
                on="order_id",
            )
            .filter(pl.col("item_a1") < pl.col("item_a2"))
            .join(pair_table, left_on=["item_a1", "item_a2"], right_on=["item_a", "item_b"])
            .join(
                scoped_items.select(["order_id", pl.col("product_id").alias("item_b")]),
                on="order_id",
            )
            .filter((pl.col("item_b") != pl.col("item_a1")) & (pl.col("item_b") != pl.col("item_a2")))
        )

        if triplet_df.is_empty():
            return []

        triplet_stats = (
            triplet_df.group_by(["item_a1", "item_a2", "item_b", "supp_a1_a2"])
            .agg(pl.len().alias("triplet_co_occurrence"))
            .with_columns([
                (pl.col("triplet_co_occurrence") / total_weight).alias("triplet_support")
            ])
            .filter(pl.col("triplet_support") >= self.min_support)
        )

        triplet_rules: List[AssociationRule] = []
        for row in triplet_stats.to_dicts():
            a1 = row["item_a1"]
            a2 = row["item_a2"]
            b = row["item_b"]

            supp_a1_a2_b = row["triplet_support"]
            supp_a1_a2 = row["supp_a1_a2"]
            supp_b = item_lookup[b]["support"]

            if supp_a1_a2 <= 0 or supp_b <= 0:
                continue

            confidence = supp_a1_a2_b / supp_a1_a2
            lift = confidence / supp_b

            if confidence >= self.min_confidence and lift >= self.min_lift:
                name_a1 = item_lookup[a1]["name"]
                name_a2 = item_lookup[a2]["name"]
                name_b = item_lookup[b]["name"]

                conf_pct = round(confidence * 100, 1)
                lift_val = round(lift, 2)
                pitch = f"Customers purchasing both '{name_a1}' and '{name_a2}' buy '{name_b}' {conf_pct}% of the time ({lift_val}x average)."

                triplet_rules.append(AssociationRule(
                    antecedent_ids=[a1, a2],
                    antecedent_names=[name_a1, name_a2],
                    consequent_id=b,
                    consequent_name=name_b,
                    support=round(supp_a1_a2_b, 4),
                    confidence=round(confidence, 4),
                    lift=round(lift, 3),
                    conviction=round(999.0 if confidence >= 0.999 else (1.0 - supp_b) / (1.0 - confidence), 3),
                    co_occurrence_count=int(row["triplet_co_occurrence"]),
                    organic_co_occurrence_count=int(row["triplet_co_occurrence"]),
                    prompted_co_occurrence_count=0,
                    pitch_script=pitch,
                ))

        return triplet_rules

    def find_gap_customers(
        self,
        orders_df: pl.DataFrame,
        antecedent_ids: List[str],
        consequent_id: str,
        consequent_price: float = 0.0,
    ) -> CustomerGapCohort:
        """
        Discovers customers who have purchased ALL antecedent items in their historical orders
        but have NEVER purchased the consequent item.
        """
        if orders_df.is_empty():
            return CustomerGapCohort(
                antecedent_ids=antecedent_ids,
                consequent_id=consequent_id,
                consequent_name="Unknown",
                consequent_price=consequent_price,
                total_target_customers=0,
                estimated_incremental_revenue=0.0,
                customers=[],
            )

        # Normalize types
        df = orders_df.select([
            pl.col("customer_id").cast(pl.Utf8),
            pl.col("customer_name").cast(pl.Utf8),
            pl.col("product_id").cast(pl.Utf8),
            pl.col("product_name").cast(pl.Utf8),
            (
                pl.col("line_total").cast(pl.Float64)
                if "line_total" in orders_df.columns
                else pl.lit(0.0)
            ).alias("line_total"),
        ]).filter(pl.col("customer_id").is_not_null() & (pl.col("customer_id") != ""))

        # Consequent item name lookup
        consequent_name = "Target Item"
        consequent_matches = df.filter(pl.col("product_id") == str(consequent_id))
        if not consequent_matches.is_empty():
            consequent_name = consequent_matches["product_name"][0]

        # 1. Identify customers who have ever purchased the consequent item
        customers_with_consequent = set(
            consequent_matches.select("customer_id").unique()["customer_id"].to_list()
        )

        # 2. Identify customers who bought the antecedent items
        antecedent_set = set(str(a) for a in antecedent_ids)
        antecedent_orders = df.filter(pl.col("product_id").is_in(antecedent_set))

        # Group by customer and check that they purchased ALL antecedents
        customer_antecedents = (
            antecedent_orders.group_by(["customer_id", "customer_name"])
            .agg([
                pl.col("product_id").n_unique().alias("distinct_antecedents_bought"),
                pl.col("line_total").sum().alias("total_antecedent_spend"),
            ])
            .filter(pl.col("distinct_antecedents_bought") == len(antecedent_set))
        )

        # 3. Filter out customers who already own the consequent item
        gap_customers_df = customer_antecedents.filter(
            ~pl.col("customer_id").is_in(customers_with_consequent)
        )

        customer_list = [
            {
                "customer_id": row["customer_id"],
                "customer_name": row["customer_name"],
                "total_antecedent_spend": round(float(row["total_antecedent_spend"]), 2),
                "potential_upsell_item": consequent_name,
                "potential_value": round(float(consequent_price), 2),
            }
            for row in gap_customers_df.sort("total_antecedent_spend", descending=True).to_dicts()
        ]

        total_target = len(customer_list)
        est_revenue = round(total_target * float(consequent_price), 2)

        return CustomerGapCohort(
            antecedent_ids=[str(a) for a in antecedent_ids],
            consequent_id=str(consequent_id),
            consequent_name=consequent_name,
            consequent_price=float(consequent_price),
            total_target_customers=total_target,
            estimated_incremental_revenue=est_revenue,
            customers=customer_list,
        )


# Singleton instance
cross_sell_engine = CrossSellEngine()
