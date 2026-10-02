"""
Pydantic Schemas for azbooks-analytics RPC contracts.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class WastegateMetrics(BaseModel):
    wastegate_active: bool
    max_memory: str
    threads: int
    preserve_insertion_order: bool
    temp_directory: str
    spill_disk_bytes: int


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "azbooks-analytics"
    version: str = "1.0.0"
    wastegate: WastegateMetrics


class AnalyticalQueryRequest(BaseModel):
    table: str = Field(..., description="Target analytical table from approved whitelist")
    projections: List[str] = Field(default_factory=list, description="Columns to project")
    where_clause: Optional[str] = Field(default=None, description="Parameterized expression")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Safe SQL parameters")
    limit: int = Field(default=100, ge=1, le=50000, description="Max rows to return")


class AnalyticalQueryResponse(BaseModel):
    rows: List[Dict[str, Any]]
    total_count: int
    execution_ms: float
    memory_spill_occurred: bool


class EngineStatus(BaseModel):
    engine_id: str
    name: str
    ready: bool
    version: str


class CrossSellRuleItem(BaseModel):
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


class CrossSellRulesRequest(BaseModel):
    transactions: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional explicit transaction rows. If omitted, fetched from database.",
    )
    min_support: float = Field(default=0.01, ge=0.001, le=1.0)
    min_confidence: float = Field(default=0.10, ge=0.01, le=1.0)
    min_lift: float = Field(default=1.05, ge=1.0, le=100.0)
    max_antecedents: int = Field(default=2, ge=1, le=2)
    recommendation_weight: float = Field(default=0.25, ge=0.05, le=1.0)
    limit: int = Field(default=50, ge=1, le=200)


class CrossSellRulesResponse(BaseModel):
    status: str = "success"
    total_rules: int
    rules: List[CrossSellRuleItem]
    execution_ms: float


class CrossSellGapRequest(BaseModel):
    orders_data: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional customer order items. If omitted, fetched from database.",
    )
    antecedent_ids: List[str] = Field(..., min_length=1)
    consequent_id: str
    consequent_price: float = Field(default=0.0, ge=0.0)


class CrossSellGapResponse(BaseModel):
    status: str = "success"
    antecedent_ids: List[str]
    consequent_id: str
    consequent_name: str
    consequent_price: float
    total_target_customers: int
    estimated_incremental_revenue: float
    customers: List[Dict[str, Any]]
    execution_ms: float


class DemandForecastItem(BaseModel):
    product_id: str
    product_name: str
    forecast_method: str
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
    stockout_risk: str
    reasoning: str


class DemandForecastRequest(BaseModel):
    product_id: str
    product_name: str
    daily_sales_history: List[float] = Field(default_factory=list)
    current_stock: int = Field(default=0, ge=0)
    owed_stock: int = Field(default=0, ge=0)
    base_lead_time_days: int = Field(default=5, ge=1, le=120)
    horizon_days: int = Field(default=30, ge=1, le=365)
    vendor_case_pack: int = Field(default=1, ge=1, le=5000)
    moq: int = Field(default=1, ge=0, le=50000)
    target_date: Optional[str] = Field(default=None, description="ISO Date string YYYY-MM-DD")


class DemandForecastResponse(BaseModel):
    status: str = "success"
    forecast: DemandForecastItem
    execution_ms: float


class BatchReplenishmentRequest(BaseModel):
    items: List[DemandForecastRequest] = Field(..., min_length=1, max_length=500)


class BatchReplenishmentResponse(BaseModel):
    status: str = "success"
    total_items: int
    critical_risk_count: int
    warning_risk_count: int
    healthy_count: int
    total_recommended_units: int
    recommendations: List[DemandForecastItem]
    execution_ms: float


class VillageRecordInput(BaseModel):
    village_id: str
    village_name: Optional[str] = None
    taluka: Optional[str] = None
    district: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    order_id: str
    order_total: float = Field(default=0.0, ge=0.0)
    season: str = Field(default="current", description="'current' or 'prior'")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    estimated_capacity: Optional[int] = None


class VillageMatrixItemSchema(BaseModel):
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


class VillagePenetrationRequest(BaseModel):
    records: Optional[List[VillageRecordInput]] = Field(
        default=None,
        description="Optional customer transactions with spatial points. If omitted, extracted from DB.",
    )
    frontier_rmi_threshold: float = Field(default=0.15, ge=0.01, le=5.0)
    penetration_threshold: float = Field(default=0.35, ge=0.05, le=0.95)
    min_revenue_floor: float = Field(default=0.0, ge=0.0)


class VillagePenetrationResponse(BaseModel):
    status: str = "success"
    total_villages: int
    frontier_count: int
    fortress_count: int
    at_risk_count: int
    stagnant_count: int
    mature_count: int
    matrix: List[VillageMatrixItemSchema]
    execution_ms: float


class VillageCustomerItemSchema(BaseModel):
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


class VillageCohortRequest(BaseModel):
    records: Optional[List[VillageRecordInput]] = Field(
        default=None,
        description="Optional customer transactions. If omitted, extracted from DB.",
    )
    target_quadrants: Optional[List[str]] = Field(
        default=None,
        description="Optional list of strategic quadrants (e.g. ['HIGH_GROWTH_FRONTIER', 'AT_RISK_DEFENSIVE'])",
    )
    target_village_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional list of specific village IDs to isolate",
    )


class VillageCohortResponse(BaseModel):
    status: str = "success"
    segment_name: str
    target_quadrants: List[str]
    target_village_count: int
    total_customers: int
    potential_pipeline_revenue: float
    customers: List[VillageCustomerItemSchema]
    execution_ms: float


class PricingTransactionInput(BaseModel):
    price: float = Field(..., gt=0.0)
    quantity: float = Field(..., gt=0.0)


class PriceElasticityRequest(BaseModel):
    product_id: str
    product_name: str
    category_name: Optional[str] = "General"
    current_price: float = Field(..., gt=0.0)
    unit_cost: float = Field(..., ge=0.0)
    mrp: Optional[float] = None
    transactions: Optional[List[PricingTransactionInput]] = Field(
        default=None,
        description="Historical price and quantity observations. If omitted, extracted from DB.",
    )


class PriceElasticityItemSchema(BaseModel):
    product_id: str
    product_name: str
    category_name: str
    sample_size: int
    price_variance: float
    current_price: float
    unit_cost: float
    current_gross_margin_pct: float
    price_elasticity: float
    demand_classification: str
    r_squared: float
    confidence_level: str
    optimal_price: float
    recommended_price_change_pct: float
    recommended_action: str
    has_anomaly: bool
    anomaly_reason: str


class PriceElasticityResponse(BaseModel):
    status: str = "success"
    result: PriceElasticityItemSchema
    execution_ms: float


class BatchElasticityRequest(BaseModel):
    items: List[PriceElasticityRequest] = Field(..., min_length=1, max_length=200)


class BatchElasticityResponse(BaseModel):
    status: str = "success"
    total_items: int
    inelastic_count: int
    elastic_count: int
    unitary_count: int
    results: List[PriceElasticityItemSchema]
    execution_ms: float


class PriceSimulationRequest(BaseModel):
    product_id: str
    product_name: str
    current_price: float = Field(..., gt=0.0)
    proposed_price: float = Field(..., gt=0.0)
    unit_cost: float = Field(..., ge=0.0)
    baseline_volume: float = Field(default=100.0, gt=0.0)
    price_elasticity: Optional[float] = None
    category_name: Optional[str] = "General"


class PriceSimulationItemSchema(BaseModel):
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


class PriceSimulationResponse(BaseModel):
    status: str = "success"
    simulation: PriceSimulationItemSchema
    execution_ms: float


class ProductSalesRecordInput(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    category_name: Optional[str] = "General"
    vendor_id: Optional[str] = "unassigned"
    vendor_name: Optional[str] = "Unassigned Vendor"
    customer_id: Optional[str] = None
    quantity: int = Field(default=1, ge=1)


class ProductReturnRecordInput(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    category_name: Optional[str] = "General"
    vendor_id: Optional[str] = "unassigned"
    vendor_name: Optional[str] = "Unassigned Vendor"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    village_name: Optional[str] = None
    reason: str = Field(default="Damaged")
    quantity: int = Field(default=1, ge=1)
    refund_amount: float = Field(default=0.0, ge=0.0)


class ProductDefectRequest(BaseModel):
    sales_records: Optional[List[ProductSalesRecordInput]] = Field(
        default=None,
        description="Optional sales volume records. If omitted, extracted from DB.",
    )
    return_records: Optional[List[ProductReturnRecordInput]] = Field(
        default=None,
        description="Optional return records. If omitted, extracted from DB.",
    )
    alpha: float = Field(default=1.0, ge=0.1, le=10.0)
    beta: float = Field(default=99.0, ge=1.0, le=1000.0)


class ProductDefectItemSchema(BaseModel):
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
    quality_status: str
    primary_defect_reason: str
    recommended_action: str


class ProductDefectResponse(BaseModel):
    status: str = "success"
    total_products: int
    critical_defect_count: int
    elevated_defect_count: int
    acceptable_count: int
    excellent_count: int
    products: List[ProductDefectItemSchema]
    execution_ms: float


class VendorScorecardRequest(BaseModel):
    sales_records: Optional[List[ProductSalesRecordInput]] = Field(
        default=None,
        description="Optional sales volume records. If omitted, extracted from DB.",
    )
    return_records: Optional[List[ProductReturnRecordInput]] = Field(
        default=None,
        description="Optional return records. If omitted, extracted from DB.",
    )
    po_freeze_threshold: float = Field(default=6.0, ge=2.0, le=20.0)
    min_defects_for_freeze: int = Field(default=5, ge=1, le=50)


class VendorScorecardItemSchema(BaseModel):
    vendor_id: str
    vendor_name: str
    total_units_sold: int
    total_physical_defects: int
    total_consignment_unsold: int
    bayesian_defect_density_pct: float
    vendor_quality_grade: str
    po_freeze_recommended: bool
    top_defective_products: List[Dict[str, Any]]
    recommended_procurement_action: str


class VendorScorecardResponse(BaseModel):
    status: str = "success"
    total_vendors: int
    po_freeze_count: int
    elevated_count: int
    acceptable_count: int
    excellent_count: int
    scorecards: List[VendorScorecardItemSchema]
    execution_ms: float


class DissatisfiedCustomerRequest(BaseModel):
    sales_records: Optional[List[ProductSalesRecordInput]] = Field(
        default=None,
        description="Optional sales volume records. If omitted, extracted from DB.",
    )
    return_records: Optional[List[ProductReturnRecordInput]] = Field(
        default=None,
        description="Optional return records. If omitted, extracted from DB.",
    )
    min_defective_items: int = Field(default=2, ge=1, le=20)


class DissatisfiedCustomerItemSchema(BaseModel):
    customer_id: str
    customer_name: str
    phone: str
    village_name: str
    total_orders: int
    total_units_purchased: int
    defective_items_returned: int
    total_refund_amount: float
    defect_encounter_rate_pct: float
    churn_risk_level: str
    recommended_retention_action: str


class DissatisfiedCustomerResponse(BaseModel):
    status: str = "success"
    total_at_risk_customers: int
    critical_risk_count: int
    high_risk_count: int
    moderate_risk_count: int
    total_refund_exposure: float
    customers: List[DissatisfiedCustomerItemSchema]
    execution_ms: float


# ============================================================================
# Course 6 Slice 6.2: Khata Working Capital Gate Models
# ============================================================================

class InvoiceRecordInput(BaseModel):
    id: str
    date: str
    amount: float = Field(ge=0.0)
    net_paid: float = Field(default=0.0, ge=0.0)


class PaymentRecordInput(BaseModel):
    id: str
    date: str
    amount: float = Field(ge=0.0)


class AccountEvaluationRequest(BaseModel):
    account_id: str
    account_name: str = "Customer Account"
    invoices: List[InvoiceRecordInput] = Field(default_factory=list)
    payments: List[PaymentRecordInput] = Field(default_factory=list)
    credit_limit: Optional[float] = Field(default=50000.0, ge=0.0)
    max_dso_threshold: int = Field(default=45, ge=1, le=365)
    legacy_debt_amount: float = Field(default=0.0, ge=0.0)


class AgingBreakdownSchema(BaseModel):
    current_0_30: float
    watchlist_31_45: float
    delinquent_46_60: float
    critical_61_plus: float


class AccountEvaluationResponse(BaseModel):
    status: str = "success"
    account_id: str
    account_name: str
    is_cleared: bool
    gate_status: str
    max_dso_days: int
    weighted_dso_days: float
    outstanding_balance: float
    credit_limit: float
    credit_utilization_pct: float
    oldest_unpaid_date: Optional[str] = None
    unpaid_invoice_count: int
    aging_breakdown: AgingBreakdownSchema
    violations: List[str]
    recommended_action: str
    execution_ms: float


class BatchAccountGateRequest(BaseModel):
    accounts: List[AccountEvaluationRequest] = Field(default_factory=list)
    max_dso_threshold: int = Field(default=45, ge=1, le=365)


class BatchAccountGateResponse(BaseModel):
    status: str = "success"
    total_accounts_evaluated: int
    cleared_accounts_count: int
    warning_accounts_count: int
    blocked_accounts_count: int
    total_blocked_receivables_exposure: float
    accounts: List[Dict[str, Any]]
    execution_ms: float


class AndonLineItemInput(BaseModel):
    product_id: str
    product_name: str = "Unknown Product"
    proposed_quantity: int = Field(ge=1)
    baseline_quantity: int = Field(default=0, ge=0)
    proposed_unit_cost: float = Field(default=0.0, ge=0.0)
    baseline_unit_cost: float = Field(default=0.0, ge=0.0)
    selling_price: float = Field(default=0.0, ge=0.0)


class AndonBatchEvaluationRequest(BaseModel):
    items: List[AndonLineItemInput] = Field(default_factory=list)
    evaluation_date: Optional[str] = None
    vendor_name: Optional[str] = None


class AndonBatchEvaluationResponse(BaseModel):
    status: str = "success"
    andon_status: str
    is_tripped: bool
    total_items_evaluated: int
    offending_items_count: int
    trip_reasons: List[str]
    offending_items: List[Dict[str, Any]]
    evaluations: List[Dict[str, Any]]
    action_required: str
    evaluated_at: str
    execution_ms: float





