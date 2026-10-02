"""
Quantitative Analytical Engines for azbooks-analytics.
Submodules are lazily loaded on demand via PEP 562 to prevent eager dependency cascading.
"""

__all__ = [
    "cross_sell_engine",
    "CrossSellEngine",
    "demand_engine",
    "SeasonalDemandEngine",
    "village_engine",
    "GeographicVillageEngine",
    "pricing_engine",
    "DynamicPricingEngine",
    "defect_engine",
    "QualityDefectRadarEngine",
    "KhataWorkingCapitalGateEngine",
    "TPSAndonCordEngine",
]


def __getattr__(name: str):
    if name in ("cross_sell_engine", "CrossSellEngine"):
        from .cross_sell import cross_sell_engine, CrossSellEngine
        return cross_sell_engine if name == "cross_sell_engine" else CrossSellEngine
    if name in ("demand_engine", "SeasonalDemandEngine"):
        from .demand import demand_engine, SeasonalDemandEngine
        return demand_engine if name == "demand_engine" else SeasonalDemandEngine
    if name in ("village_engine", "GeographicVillageEngine"):
        from .village import village_engine, GeographicVillageEngine
        return village_engine if name == "village_engine" else GeographicVillageEngine
    if name in ("pricing_engine", "DynamicPricingEngine"):
        from .pricing import pricing_engine, DynamicPricingEngine
        return pricing_engine if name == "pricing_engine" else DynamicPricingEngine
    if name in ("defect_engine", "QualityDefectRadarEngine"):
        from .defects import defect_engine, QualityDefectRadarEngine
        return defect_engine if name == "defect_engine" else QualityDefectRadarEngine
    if name == "KhataWorkingCapitalGateEngine":
        from .khata_gate import KhataWorkingCapitalGateEngine
        return KhataWorkingCapitalGateEngine
    if name == "TPSAndonCordEngine":
        from .andon_cord import TPSAndonCordEngine
        return TPSAndonCordEngine
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


