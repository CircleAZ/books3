"""
API routes for azbooks-analytics service.
"""

from datetime import datetime, date
import time
import logging
from fastapi import APIRouter, HTTPException, status
import polars as pl
from ..core.config import settings
from ..core.wastegate import wastegate
from ..core.security import validate_table_name, sanitize_column_name, SecurityViolation
from ..core.db import (
    fetch_order_transactions,
    fetch_village_order_data,
    fetch_product_pricing_history,
    fetch_return_records,
    fetch_product_sales_volume,
)
from ..engines.cross_sell import cross_sell_engine, CrossSellEngine
from ..engines.demand import demand_engine, SeasonalDemandEngine
from ..engines.village import village_engine, GeographicVillageEngine
from ..engines.pricing import pricing_engine, DynamicPricingEngine
from ..engines.defects import defect_engine, QualityDefectRadarEngine
from ..engines.khata_gate import KhataWorkingCapitalGateEngine
from ..engines.andon_cord import TPSAndonCordEngine
from .schemas import (
    HealthResponse,
    WastegateMetrics,
    AnalyticalQueryRequest,
    AnalyticalQueryResponse,
    EngineStatus,
    CrossSellRulesRequest,
    CrossSellRulesResponse,
    CrossSellRuleItem,
    CrossSellGapRequest,
    CrossSellGapResponse,
    DemandForecastRequest,
    DemandForecastResponse,
    DemandForecastItem,
    BatchReplenishmentRequest,
    BatchReplenishmentResponse,
    VillageRecordInput,
    VillagePenetrationRequest,
    VillagePenetrationResponse,
    VillageMatrixItemSchema,
    VillageCohortRequest,
    VillageCohortResponse,
    VillageCustomerItemSchema,
    PricingTransactionInput,
    PriceElasticityRequest,
    PriceElasticityResponse,
    PriceElasticityItemSchema,
    BatchElasticityRequest,
    BatchElasticityResponse,
    PriceSimulationRequest,
    PriceSimulationResponse,
    PriceSimulationItemSchema,
    ProductSalesRecordInput,
    ProductReturnRecordInput,
    ProductDefectRequest,
    ProductDefectResponse,
    ProductDefectItemSchema,
    VendorScorecardRequest,
    VendorScorecardResponse,
    VendorScorecardItemSchema,
    DissatisfiedCustomerRequest,
    DissatisfiedCustomerResponse,
    DissatisfiedCustomerItemSchema,
    InvoiceRecordInput,
    PaymentRecordInput,
    AccountEvaluationRequest,
    AgingBreakdownSchema,
    AccountEvaluationResponse,
    BatchAccountGateRequest,
    BatchAccountGateResponse,
    AndonBatchEvaluationRequest,
    AndonBatchEvaluationResponse,
)

logger = logging.getLogger("azbooks.analytics.api")
router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health():
    """Service liveness probe and wastegate telemetry."""
    status_dict = wastegate.get_status()
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=settings.version,
        wastegate=WastegateMetrics(**status_dict),
    )


@router.get("/wastegate/status", response_model=WastegateMetrics)
def get_wastegate_status():
    """Inspects DuckDB memory ceiling, active thread pool, and disk partition spill byte usage."""
    return WastegateMetrics(**wastegate.get_status())


@router.post("/wastegate/stress-test")
def run_wastegate_stress_test(row_count: int = 1_000_000):
    """
    Stress-tests the mechanical wastegate: generates high-volume synthetic vectors in DuckDB
    to prove memory clamping holds firm and partition spilling handles load safely.
    """
    start_time = time.perf_counter()
    try:
        with wastegate.connection_scope() as conn:
            # Generate synthetic analytical dataset
            res = conn.execute(f"""
                WITH synthetic_sales AS (
                    SELECT 
                        range AS transaction_id,
                        (range % 500) AS product_id,
                        (range % 100) AS customer_id,
                        (range * 1.75) % 1500 AS amount,
                        strftime(TIMESTAMP '2026-01-01' + INTERVAL (range % 365) DAYS, '%Y-%m-%d') AS sale_date
                    FROM range({row_count})
                )
                SELECT 
                    product_id,
                    COUNT(*) AS total_orders,
                    SUM(amount) AS gross_revenue,
                    AVG(amount) AS average_basket
                FROM synthetic_sales
                GROUP BY product_id
                ORDER BY gross_revenue DESC
                LIMIT 10;
            """).df()

            elapsed_ms = (time.perf_counter() - start_time) * 1000
            metrics = wastegate.get_status()

            return {
                "status": "success",
                "rows_processed": row_count,
                "top_products_count": len(res),
                "execution_ms": round(elapsed_ms, 2),
                "wastegate_metrics": metrics,
                "sample_results": res.head(3).to_dict(orient="records"),
            }
    except Exception as e:
        logger.error(f"Stress test error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Wastegate stress test failed: {str(e)}"
        )


@router.get("/engines", response_model=list[EngineStatus])
def list_quantitative_engines():
    """Reports status of the 5 quantitative engines scheduled for Course 5."""
    return [
        EngineStatus(
            engine_id="cross_sell",
            name="Market Basket & Cross-Selling (FP-Growth)",
            ready=True,
            version="1.0.0",
        ),
        EngineStatus(
            engine_id="demand",
            name="Seasonal Demand & Replenishment Forecaster",
            ready=True,
            version="1.0.0",
        ),
        EngineStatus(
            engine_id="village",
            name="Geographic Village Penetration Matrix (H3 Spatial)",
            ready=True,
            version="1.0.0",
        ),
        EngineStatus(
            engine_id="pricing",
            name="Dynamic Pricing & Margin Elasticity",
            ready=True,
            version="1.0.0",
        ),
        EngineStatus(
            engine_id="defect_radar",
            name="Quality Defect & Return Radar (Bayesian)",
            ready=True,
            version="1.0.0",
        ),
    ]


@router.post("/engines/cross-sell/rules", response_model=CrossSellRulesResponse)
def compute_cross_sell_rules(payload: CrossSellRulesRequest):
    """
    Computes de-biased market basket association rules using vectorized Polars mining.
    Applies inverse propensity weighting on recommendation-prompted transactions.
    """
    start_time = time.perf_counter()
    try:
        if payload.transactions is not None:
            df = pl.DataFrame(payload.transactions) if payload.transactions else pl.DataFrame()
        else:
            try:
                df = fetch_order_transactions(limit=50000)
            except Exception as e:
                logger.warning(f"Could not fetch database transactions for cross-sell: {e}")
                df = pl.DataFrame()

        if df.is_empty():
            return CrossSellRulesResponse(
                status="success",
                total_rules=0,
                rules=[],
                execution_ms=round((time.perf_counter() - start_time) * 1000, 2),
            )

        engine = CrossSellEngine(
            min_support=payload.min_support,
            min_confidence=payload.min_confidence,
            min_lift=payload.min_lift,
            max_antecedents=payload.max_antecedents,
            recommendation_weight=payload.recommendation_weight,
        )

        rules = engine.analyze(df, limit_rules=payload.limit)
        rule_items = [
            CrossSellRuleItem(
                antecedent_ids=r.antecedent_ids,
                antecedent_names=r.antecedent_names,
                consequent_id=r.consequent_id,
                consequent_name=r.consequent_name,
                support=r.support,
                confidence=r.confidence,
                lift=r.lift,
                conviction=r.conviction,
                co_occurrence_count=r.co_occurrence_count,
                organic_co_occurrence_count=r.organic_co_occurrence_count,
                prompted_co_occurrence_count=r.prompted_co_occurrence_count,
                pitch_script=r.pitch_script,
            )
            for r in rules
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return CrossSellRulesResponse(
            status="success",
            total_rules=len(rule_items),
            rules=rule_items,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Cross-sell rule generation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cross-sell engine computation failed: {str(e)}"
        )


@router.post("/engines/cross-sell/gap-analysis", response_model=CrossSellGapResponse)
def compute_cross_sell_gap_analysis(payload: CrossSellGapRequest):
    """
    Extracts customer gap cohorts: identifies all customers who bought antecedent products
    but have never purchased the consequent product across their historical orders.
    """
    start_time = time.perf_counter()
    try:
        if payload.orders_data is not None:
            df = pl.DataFrame(payload.orders_data) if payload.orders_data else pl.DataFrame()
        else:
            try:
                df = fetch_order_transactions(limit=50000)
            except Exception as e:
                logger.warning(f"Could not fetch database transactions for gap analysis: {e}")
                df = pl.DataFrame()

        cohort = cross_sell_engine.find_gap_customers(
            orders_df=df,
            antecedent_ids=payload.antecedent_ids,
            consequent_id=payload.consequent_id,
            consequent_price=payload.consequent_price,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return CrossSellGapResponse(
            status="success",
            antecedent_ids=cohort.antecedent_ids,
            consequent_id=cohort.consequent_id,
            consequent_name=cohort.consequent_name,
            consequent_price=cohort.consequent_price,
            total_target_customers=cohort.total_target_customers,
            estimated_incremental_revenue=cohort.estimated_incremental_revenue,
            customers=cohort.customers,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Cross-sell gap analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cross-sell gap analysis failed: {str(e)}"
        )


@router.post("/engines/demand/forecast", response_model=DemandForecastResponse)
def compute_demand_forecast(payload: DemandForecastRequest):
    """
    Computes single-SKU demand forecast, dynamic peak-rush safety stock,
    and master-carton quantized purchase order recommendation.
    """
    start_time = time.perf_counter()
    try:
        target_d = None
        if payload.target_date:
            try:
                target_d = datetime.strptime(payload.target_date, "%Y-%m-%d").date()
            except ValueError:
                pass

        result = demand_engine.compute_replenishment(
            product_id=payload.product_id,
            product_name=payload.product_name,
            daily_sales_history=payload.daily_sales_history,
            current_stock=payload.current_stock,
            owed_stock=payload.owed_stock,
            base_lead_time_days=payload.base_lead_time_days,
            horizon_days=payload.horizon_days,
            vendor_case_pack=payload.vendor_case_pack,
            moq=payload.moq,
            as_of_date=target_d,
        )

        item = DemandForecastItem(
            product_id=result.product_id,
            product_name=result.product_name,
            forecast_method=result.forecast_method,
            historical_daily_avg=result.historical_daily_avg,
            forecasted_daily_demand=result.forecasted_daily_demand,
            forecasted_horizon_demand=result.forecasted_horizon_demand,
            horizon_days=result.horizon_days,
            base_lead_time_days=result.base_lead_time_days,
            effective_lead_time_days=result.effective_lead_time_days,
            is_peak_season=result.is_peak_season,
            safety_stock_units=result.safety_stock_units,
            current_physical_stock=result.current_physical_stock,
            owed_reserved_stock=result.owed_reserved_stock,
            available_stock=result.available_stock,
            net_requirement_units=result.net_requirement_units,
            vendor_case_pack=result.vendor_case_pack,
            moq=result.moq,
            recommended_po_quantity=result.recommended_po_quantity,
            recommended_carton_count=result.recommended_carton_count,
            days_of_inventory_remaining=result.days_of_inventory_remaining,
            stockout_risk=result.stockout_risk,
            reasoning=result.reasoning,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return DemandForecastResponse(
            status="success",
            forecast=item,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Demand forecast error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Demand forecasting computation failed: {str(e)}"
        )


@router.post("/engines/demand/batch-replenishment", response_model=BatchReplenishmentResponse)
def compute_batch_replenishment(payload: BatchReplenishmentRequest):
    """
    Batch evaluates replenishment across multiple catalog items.
    Ranks items by stockout urgency (CRITICAL -> WARNING -> HEALTHY) and net requirement.
    """
    start_time = time.perf_counter()
    try:
        recommendations: list[DemandForecastItem] = []
        critical_count = 0
        warning_count = 0
        healthy_count = 0
        total_units = 0

        for req in payload.items:
            target_d = None
            if req.target_date:
                try:
                    target_d = datetime.strptime(req.target_date, "%Y-%m-%d").date()
                except ValueError:
                    pass

            res = demand_engine.compute_replenishment(
                product_id=req.product_id,
                product_name=req.product_name,
                daily_sales_history=req.daily_sales_history,
                current_stock=req.current_stock,
                owed_stock=req.owed_stock,
                base_lead_time_days=req.base_lead_time_days,
                horizon_days=req.horizon_days,
                vendor_case_pack=req.vendor_case_pack,
                moq=req.moq,
                as_of_date=target_d,
            )

            if res.stockout_risk == "CRITICAL":
                critical_count += 1
            elif res.stockout_risk == "WARNING":
                warning_count += 1
            else:
                healthy_count += 1

            total_units += res.recommended_po_quantity

            recommendations.append(DemandForecastItem(
                product_id=res.product_id,
                product_name=res.product_name,
                forecast_method=res.forecast_method,
                historical_daily_avg=res.historical_daily_avg,
                forecasted_daily_demand=res.forecasted_daily_demand,
                forecasted_horizon_demand=res.forecasted_horizon_demand,
                horizon_days=res.horizon_days,
                base_lead_time_days=res.base_lead_time_days,
                effective_lead_time_days=res.effective_lead_time_days,
                is_peak_season=res.is_peak_season,
                safety_stock_units=res.safety_stock_units,
                current_physical_stock=res.current_physical_stock,
                owed_reserved_stock=res.owed_reserved_stock,
                available_stock=res.available_stock,
                net_requirement_units=res.net_requirement_units,
                vendor_case_pack=res.vendor_case_pack,
                moq=res.moq,
                recommended_po_quantity=res.recommended_po_quantity,
                recommended_carton_count=res.recommended_carton_count,
                days_of_inventory_remaining=res.days_of_inventory_remaining,
                stockout_risk=res.stockout_risk,
                reasoning=res.reasoning,
            ))

        # Sort recommendations by urgency: CRITICAL first, then WARNING, then HEALTHY; within risk by net_requirement desc
        risk_priority = {"CRITICAL": 0, "WARNING": 1, "HEALTHY": 2}
        recommendations.sort(key=lambda x: (risk_priority[x.stockout_risk], -x.net_requirement_units))

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return BatchReplenishmentResponse(
            status="success",
            total_items=len(recommendations),
            critical_risk_count=critical_count,
            warning_risk_count=warning_count,
            healthy_count=healthy_count,
            total_recommended_units=total_units,
            recommendations=recommendations,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Batch replenishment error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch replenishment failed: {str(e)}"
        )


@router.post("/engines/village/penetration", response_model=VillagePenetrationResponse)
def analyze_village_penetration(request: VillagePenetrationRequest):
    """
    Evaluates village market penetration depth, customer density, and Revenue Momentum Index (RMI)
    with Uber H3 spatial tokens (Res 7 & 8 uint64).
    """
    start_time = time.perf_counter()
    try:
        if request.records is not None and len(request.records) > 0:
            raw_data = [r.model_dump() for r in request.records]
            df = pl.DataFrame(raw_data)
        else:
            df = fetch_village_order_data()

        engine = GeographicVillageEngine(
            frontier_rmi_threshold=request.frontier_rmi_threshold,
            penetration_threshold=request.penetration_threshold,
        )
        matrix = engine.analyze(df, min_revenue_floor=request.min_revenue_floor)

        frontier_count = sum(1 for m in matrix if m.strategic_quadrant == "HIGH_GROWTH_FRONTIER")
        fortress_count = sum(1 for m in matrix if m.strategic_quadrant == "CORE_FORTRESS")
        at_risk_count = sum(1 for m in matrix if m.strategic_quadrant == "AT_RISK_DEFENSIVE")
        stagnant_count = sum(1 for m in matrix if m.strategic_quadrant == "STAGNANT_DESERT")
        mature_count = sum(1 for m in matrix if m.strategic_quadrant == "STABLE_MATURE")

        matrix_schemas = [
            VillageMatrixItemSchema(
                village_id=item.village_id,
                village_name=item.village_name,
                taluka=item.taluka,
                district=item.district,
                h3_res7=item.h3_res7,
                h3_res7_hex=item.h3_res7_hex,
                h3_res8=item.h3_res8,
                h3_res8_hex=item.h3_res8_hex,
                is_geocoded=item.is_geocoded,
                unique_customers=item.unique_customers,
                estimated_market_capacity=item.estimated_market_capacity,
                penetration_depth=item.penetration_depth,
                penetration_percentage=item.penetration_percentage,
                current_season_revenue=item.current_season_revenue,
                prior_season_revenue=item.prior_season_revenue,
                revenue_momentum_index=item.revenue_momentum_index,
                revenue_growth_percentage=item.revenue_growth_percentage,
                total_orders=item.total_orders,
                average_order_value=item.average_order_value,
                strategic_quadrant=item.strategic_quadrant,
                recommended_action=item.recommended_action,
            )
            for item in matrix
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return VillagePenetrationResponse(
            status="success",
            total_villages=len(matrix_schemas),
            frontier_count=frontier_count,
            fortress_count=fortress_count,
            at_risk_count=at_risk_count,
            stagnant_count=stagnant_count,
            mature_count=mature_count,
            matrix=matrix_schemas,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Village penetration analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Village penetration analysis failed: {str(e)}"
        )


@router.post("/engines/village/target-cohort", response_model=VillageCohortResponse)
def extract_village_target_cohort(request: VillageCohortRequest):
    """
    Extracts high-priority outreach customer cohorts filtered by strategic quadrant
    (e.g., HIGH_GROWTH_FRONTIER, AT_RISK_DEFENSIVE) for DiscoverySegment export.
    """
    start_time = time.perf_counter()
    try:
        if request.records is not None and len(request.records) > 0:
            raw_data = [r.model_dump() for r in request.records]
            df = pl.DataFrame(raw_data)
        else:
            df = fetch_village_order_data()

        engine = village_engine
        cohort = engine.extract_target_cohort(
            df,
            target_quadrants=request.target_quadrants,
            target_village_ids=request.target_village_ids,
        )

        customer_schemas = [
            VillageCustomerItemSchema(
                customer_id=c["customer_id"],
                customer_name=c["customer_name"],
                phone=c["phone"],
                village_id=c["village_id"],
                village_name=c["village_name"],
                taluka=c["taluka"],
                district=c["district"],
                total_orders=c["total_orders"],
                lifetime_revenue=c["lifetime_revenue"],
                strategic_quadrant=c["strategic_quadrant"],
                h3_res7_hex=c["h3_res7_hex"],
                h3_res8_hex=c["h3_res8_hex"],
            )
            for c in cohort["customers"]
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return VillageCohortResponse(
            status="success",
            segment_name=cohort["segment_name"],
            target_quadrants=cohort["target_quadrants"],
            target_village_count=cohort["target_village_count"],
            total_customers=cohort["total_customers"],
            potential_pipeline_revenue=cohort["potential_pipeline_revenue"],
            customers=customer_schemas,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Village target cohort extraction error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Village cohort extraction failed: {str(e)}"
        )


@router.post("/engines/pricing/elasticity", response_model=PriceElasticityResponse)
def analyze_price_elasticity(request: PriceElasticityRequest):
    """
    Measures historical price sensitivity, price elasticity of demand (Log-Log OLS with empirical Bayes shrinkage),
    and theoretical profit-maximizing price under mechanical governor constraints.
    """
    start_time = time.perf_counter()
    try:
        if request.transactions is not None and len(request.transactions) > 0:
            prices = [t.price for t in request.transactions]
            quantities = [t.quantity for t in request.transactions]
        else:
            df = fetch_product_pricing_history(product_id=request.product_id)
            if not df.is_empty():
                prices = df["unit_price"].to_list()
                quantities = df["quantity"].to_list()
            else:
                prices = []
                quantities = []

        item = pricing_engine.analyze_product(
            product_id=request.product_id,
            product_name=request.product_name,
            current_price=request.current_price,
            unit_cost=request.unit_cost,
            prices=prices,
            quantities=quantities,
            category_name=request.category_name,
            mrp=request.mrp,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return PriceElasticityResponse(
            status="success",
            result=PriceElasticityItemSchema(
                product_id=item.product_id,
                product_name=item.product_name,
                category_name=item.category_name,
                sample_size=item.sample_size,
                price_variance=item.price_variance,
                current_price=item.current_price,
                unit_cost=item.unit_cost,
                current_gross_margin_pct=item.current_gross_margin_pct,
                price_elasticity=item.price_elasticity,
                demand_classification=item.demand_classification,
                r_squared=item.r_squared,
                confidence_level=item.confidence_level,
                optimal_price=item.optimal_price,
                recommended_price_change_pct=item.recommended_price_change_pct,
                recommended_action=item.recommended_action,
                has_anomaly=item.has_anomaly,
                anomaly_reason=item.anomaly_reason,
            ),
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Price elasticity analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price elasticity analysis failed: {str(e)}"
        )


@router.post("/engines/pricing/batch-elasticity", response_model=BatchElasticityResponse)
def batch_analyze_price_elasticity(request: BatchElasticityRequest):
    """
    Evaluates price elasticity across multiple catalog products in batch mode.
    """
    start_time = time.perf_counter()
    try:
        results: List[PriceElasticityItemSchema] = []
        inelastic_count = 0
        elastic_count = 0
        unitary_count = 0

        for item_req in request.items:
            prices = [t.price for t in item_req.transactions] if item_req.transactions else []
            quantities = [t.quantity for t in item_req.transactions] if item_req.transactions else []

            item = pricing_engine.analyze_product(
                product_id=item_req.product_id,
                product_name=item_req.product_name,
                current_price=item_req.current_price,
                unit_cost=item_req.unit_cost,
                prices=prices,
                quantities=quantities,
                category_name=item_req.category_name,
                mrp=item_req.mrp,
            )

            if item.demand_classification == "INELASTIC":
                inelastic_count += 1
            elif item.demand_classification == "ELASTIC":
                elastic_count += 1
            else:
                unitary_count += 1

            results.append(
                PriceElasticityItemSchema(
                    product_id=item.product_id,
                    product_name=item.product_name,
                    category_name=item.category_name,
                    sample_size=item.sample_size,
                    price_variance=item.price_variance,
                    current_price=item.current_price,
                    unit_cost=item.unit_cost,
                    current_gross_margin_pct=item.current_gross_margin_pct,
                    price_elasticity=item.price_elasticity,
                    demand_classification=item.demand_classification,
                    r_squared=item.r_squared,
                    confidence_level=item.confidence_level,
                    optimal_price=item.optimal_price,
                    recommended_price_change_pct=item.recommended_price_change_pct,
                    recommended_action=item.recommended_action,
                    has_anomaly=item.has_anomaly,
                    anomaly_reason=item.anomaly_reason,
                )
            )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return BatchElasticityResponse(
            status="success",
            total_items=len(results),
            inelastic_count=inelastic_count,
            elastic_count=elastic_count,
            unitary_count=unitary_count,
            results=results,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Batch elasticity error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch elasticity analysis failed: {str(e)}"
        )


@router.post("/engines/pricing/simulate", response_model=PriceSimulationResponse)
def simulate_price_scenario(request: PriceSimulationRequest):
    """
    What-if simulation engine projecting volume delta, revenue delta, net profit change,
    and gross margin % for a proposed price change, triggering the TPS Andon latch if thresholds breach.
    """
    start_time = time.perf_counter()
    try:
        elasticity = request.price_elasticity
        if elasticity is None:
            elasticity = pricing_engine.get_category_prior(request.category_name)

        sim = pricing_engine.simulate_price_change(
            product_id=request.product_id,
            product_name=request.product_name,
            current_price=request.current_price,
            proposed_price=request.proposed_price,
            unit_cost=request.unit_cost,
            baseline_volume=request.baseline_volume,
            elasticity=elasticity,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return PriceSimulationResponse(
            status="success",
            simulation=PriceSimulationItemSchema(
                product_id=sim.product_id,
                product_name=sim.product_name,
                current_price=sim.current_price,
                proposed_price=sim.proposed_price,
                unit_cost=sim.unit_cost,
                price_change_pct=sim.price_change_pct,
                price_elasticity=sim.price_elasticity,
                baseline_volume=sim.baseline_volume,
                projected_volume=sim.projected_volume,
                volume_change_pct=sim.volume_change_pct,
                baseline_revenue=sim.baseline_revenue,
                projected_revenue=sim.projected_revenue,
                revenue_change_pct=sim.revenue_change_pct,
                baseline_profit=sim.baseline_profit,
                projected_profit=sim.projected_profit,
                profit_change_pct=sim.profit_change_pct,
                current_margin_pct=sim.current_margin_pct,
                projected_margin_pct=sim.projected_margin_pct,
                andon_latch_tripped=sim.andon_latch_tripped,
                verdict=sim.verdict,
                commercial_summary=sim.commercial_summary,
            ),
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Price scenario simulation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price scenario simulation failed: {str(e)}"
        )


@router.post("/engines/defects/product-radar", response_model=ProductDefectResponse)
def analyze_product_defects(request: ProductDefectRequest):
    """
    Evaluates product defect rates using Bayesian Laplace smoothing,
    strictly segregating physical manufacturing defects from unsold consignment returns.
    """
    start_time = time.perf_counter()
    try:
        sales_df = (
            pl.DataFrame([s.model_dump() for s in request.sales_records])
            if request.sales_records is not None and len(request.sales_records) > 0
            else fetch_product_sales_volume()
        )
        returns_df = (
            pl.DataFrame([r.model_dump() for r in request.return_records])
            if request.return_records is not None and len(request.return_records) > 0
            else fetch_return_records()
        )

        engine = QualityDefectRadarEngine(alpha=request.alpha, beta=request.beta)
        items = engine.analyze_products(sales_df, returns_df)

        crit_count = sum(1 for p in items if p.quality_status == "CRITICAL_DEFECTS")
        elev_count = sum(1 for p in items if p.quality_status == "ELEVATED_DEFECTS")
        acc_count = sum(1 for p in items if p.quality_status == "ACCEPTABLE")
        exc_count = sum(1 for p in items if p.quality_status == "EXCELLENT")

        schemas = [
            ProductDefectItemSchema(
                product_id=p.product_id,
                product_name=p.product_name,
                category_name=p.category_name,
                vendor_id=p.vendor_id,
                vendor_name=p.vendor_name,
                units_sold=p.units_sold,
                physical_defect_returns=p.physical_defect_returns,
                consignment_unsold_returns=p.consignment_unsold_returns,
                commercial_other_returns=p.commercial_other_returns,
                total_returns=p.total_returns,
                raw_defect_rate_pct=p.raw_defect_rate_pct,
                bayesian_defect_rate_pct=p.bayesian_defect_rate_pct,
                consignment_return_rate_pct=p.consignment_return_rate_pct,
                quality_status=p.quality_status,
                primary_defect_reason=p.primary_defect_reason,
                recommended_action=p.recommended_action,
            )
            for p in items
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return ProductDefectResponse(
            status="success",
            total_products=len(schemas),
            critical_defect_count=crit_count,
            elevated_defect_count=elev_count,
            acceptable_count=acc_count,
            excellent_count=exc_count,
            products=schemas,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Product defect analysis error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Product defect analysis failed: {str(e)}"
        )


@router.post("/engines/defects/vendor-scorecard", response_model=VendorScorecardResponse)
def evaluate_vendor_scorecard(request: VendorScorecardRequest):
    """
    Evaluates vendor quality scorecards and defect density, recommending procurement freezes
    if defect rate breaches threshold (e.g. > 6.0%).
    """
    start_time = time.perf_counter()
    try:
        sales_df = (
            pl.DataFrame([s.model_dump() for s in request.sales_records])
            if request.sales_records is not None and len(request.sales_records) > 0
            else fetch_product_sales_volume()
        )
        returns_df = (
            pl.DataFrame([r.model_dump() for r in request.return_records])
            if request.return_records is not None and len(request.return_records) > 0
            else fetch_return_records()
        )

        engine = QualityDefectRadarEngine(
            po_freeze_threshold=request.po_freeze_threshold,
            min_defects_for_freeze=request.min_defects_for_freeze,
        )
        scorecards = engine.analyze_vendors(sales_df, returns_df)

        freeze_count = sum(1 for v in scorecards if v.po_freeze_recommended)
        elev_count = sum(1 for v in scorecards if v.vendor_quality_grade == "ELEVATED_DEFECTS")
        acc_count = sum(1 for v in scorecards if v.vendor_quality_grade == "ACCEPTABLE")
        exc_count = sum(1 for v in scorecards if v.vendor_quality_grade == "EXCELLENT")

        schemas = [
            VendorScorecardItemSchema(
                vendor_id=v.vendor_id,
                vendor_name=v.vendor_name,
                total_units_sold=v.total_units_sold,
                total_physical_defects=v.total_physical_defects,
                total_consignment_unsold=v.total_consignment_unsold,
                bayesian_defect_density_pct=v.bayesian_defect_density_pct,
                vendor_quality_grade=v.vendor_quality_grade,
                po_freeze_recommended=v.po_freeze_recommended,
                top_defective_products=v.top_defective_products,
                recommended_procurement_action=v.recommended_procurement_action,
            )
            for v in scorecards
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return VendorScorecardResponse(
            status="success",
            total_vendors=len(schemas),
            po_freeze_count=freeze_count,
            elevated_count=elev_count,
            acceptable_count=acc_count,
            excellent_count=exc_count,
            scorecards=schemas,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Vendor scorecard error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vendor scorecard analysis failed: {str(e)}"
        )


@router.post("/engines/defects/customer-risk", response_model=DissatisfiedCustomerResponse)
def extract_dissatisfied_customers(request: DissatisfiedCustomerRequest):
    """
    Extracts customer accounts affected by physical defect returns for retention intervention
    conforming to DiscoverySegment format.
    """
    start_time = time.perf_counter()
    try:
        sales_df = (
            pl.DataFrame([s.model_dump() for s in request.sales_records])
            if request.sales_records is not None and len(request.sales_records) > 0
            else fetch_product_sales_volume()
        )
        returns_df = (
            pl.DataFrame([r.model_dump() for r in request.return_records])
            if request.return_records is not None and len(request.return_records) > 0
            else fetch_return_records()
        )

        engine = defect_engine
        customers = engine.extract_dissatisfied_customers(
            sales_df,
            returns_df,
            min_defective_items=request.min_defective_items,
        )

        crit_count = sum(1 for c in customers if c.churn_risk_level == "CRITICAL")
        high_count = sum(1 for c in customers if c.churn_risk_level == "HIGH")
        mod_count = sum(1 for c in customers if c.churn_risk_level == "MODERATE")
        tot_refund = sum(c.total_refund_amount for c in customers)

        schemas = [
            DissatisfiedCustomerItemSchema(
                customer_id=c.customer_id,
                customer_name=c.customer_name,
                phone=c.phone,
                village_name=c.village_name,
                total_orders=c.total_orders,
                total_units_purchased=c.total_units_purchased,
                defective_items_returned=c.defective_items_returned,
                total_refund_amount=c.total_refund_amount,
                defect_encounter_rate_pct=c.defect_encounter_rate_pct,
                churn_risk_level=c.churn_risk_level,
                recommended_retention_action=c.recommended_retention_action,
            )
            for c in customers
        ]

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return DissatisfiedCustomerResponse(
            status="success",
            total_at_risk_customers=len(schemas),
            critical_risk_count=crit_count,
            high_risk_count=high_count,
            moderate_risk_count=mod_count,
            total_refund_exposure=round(tot_refund, 2),
            customers=schemas,
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Customer dissatisfaction risk extraction error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Customer risk extraction failed: {str(e)}"
        )


# ============================================================================
# Course 6 Slice 6.2: Khata Working Capital Gate Endpoints
# ============================================================================

@router.post("/engines/khata/evaluate-account", response_model=AccountEvaluationResponse)
def evaluate_account_khata(request: AccountEvaluationRequest):
    """
    Evaluates an account's financial exposure using The Finn Protocol and DSO aging analysis.
    Enforces hard working capital halts if DSO > 45 days or balance > credit limit.
    """
    start_time = time.perf_counter()
    try:
        invoices_data = [inv.model_dump() for inv in request.invoices]
        payments_data = [pmt.model_dump() for pmt in request.payments]

        result = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id=request.account_id,
            account_name=request.account_name,
            invoices=invoices_data,
            payments=payments_data,
            credit_limit=request.credit_limit,
            max_dso_threshold=request.max_dso_threshold,
            legacy_debt_amount=request.legacy_debt_amount,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return AccountEvaluationResponse(
            status="success",
            account_id=result['account_id'],
            account_name=result['account_name'],
            is_cleared=result['is_cleared'],
            gate_status=result['status'],
            max_dso_days=result['max_dso_days'],
            weighted_dso_days=result['weighted_dso_days'],
            outstanding_balance=result['outstanding_balance'],
            credit_limit=result['credit_limit'],
            credit_utilization_pct=result['credit_utilization_pct'],
            oldest_unpaid_date=result['oldest_unpaid_date'],
            unpaid_invoice_count=result['unpaid_invoice_count'],
            aging_breakdown=AgingBreakdownSchema(**result['aging_breakdown']),
            violations=result['violations'],
            recommended_action=result['recommended_action'],
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Khata Gate evaluation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Khata Gate evaluation failed: {str(e)}"
        )


@router.post("/engines/khata/batch-gate-check", response_model=BatchAccountGateResponse)
def evaluate_batch_khata(request: BatchAccountGateRequest):
    """
    Evaluates a batch of customer/outlet accounts simultaneously.
    Returns cleared, warning, and blocked cohorts with aggregate receivables exposure.
    """
    start_time = time.perf_counter()
    try:
        accounts_data = []
        for acc in request.accounts:
            accounts_data.append({
                'account_id': acc.account_id,
                'account_name': acc.account_name,
                'invoices': [inv.model_dump() for inv in acc.invoices],
                'payments': [pmt.model_dump() for pmt in acc.payments],
                'credit_limit': acc.credit_limit,
                'legacy_debt_amount': acc.legacy_debt_amount,
            })

        batch_result = KhataWorkingCapitalGateEngine.batch_gate_check(
            accounts=accounts_data,
            max_dso_threshold=request.max_dso_threshold,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return BatchAccountGateResponse(
            status="success",
            total_accounts_evaluated=batch_result['total_accounts_evaluated'],
            cleared_accounts_count=batch_result['cleared_accounts_count'],
            warning_accounts_count=batch_result['warning_accounts_count'],
            blocked_accounts_count=batch_result['blocked_accounts_count'],
            total_blocked_receivables_exposure=batch_result['total_blocked_receivables_exposure'],
            accounts=batch_result['accounts'],
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"Batch Khata Gate evaluation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch Khata Gate evaluation failed: {str(e)}"
        )


@router.post("/engines/governance/andon-evaluate", response_model=AndonBatchEvaluationResponse)
def evaluate_andon_batch(request: AndonBatchEvaluationRequest):
    """
    Evaluates proposed purchase order lines against the TPS Andon Cord.
    Enforces Taiichi Ohno's Jidoka principle: freezes pipeline execution on +/-30% volume variance,
    +15% cost hike, gross margin collapse, or high-risk early June restock.
    """
    start_time = time.perf_counter()
    try:
        eval_date = None
        if request.evaluation_date:
            try:
                eval_date = datetime.strptime(request.evaluation_date, "%Y-%m-%d").date()
            except ValueError:
                pass

        items_data = [item.model_dump() for item in request.items]

        result = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items_data,
            evaluation_date=eval_date,
            vendor_name=request.vendor_name,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return AndonBatchEvaluationResponse(
            status="success",
            andon_status=result['andon_status'],
            is_tripped=result['is_tripped'],
            total_items_evaluated=result['total_items_evaluated'],
            offending_items_count=result['offending_items_count'],
            trip_reasons=result['trip_reasons'],
            offending_items=result['offending_items'],
            evaluations=result['evaluations'],
            action_required=result['action_required'],
            evaluated_at=result['evaluated_at'],
            execution_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        logger.error(f"TPS Andon Cord evaluation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TPS Andon Cord evaluation failed: {str(e)}"
        )





