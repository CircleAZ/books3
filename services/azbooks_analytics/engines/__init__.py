"""
Quantitative Analytical Engines for azbooks-analytics.
"""

try:
    from .cross_sell import cross_sell_engine, CrossSellEngine
except ImportError:
    cross_sell_engine = None
    CrossSellEngine = None

from .demand import demand_engine, SeasonalDemandEngine

try:
    from .village import village_engine, GeographicVillageEngine
except ImportError:
    village_engine = None
    GeographicVillageEngine = None

from .pricing import pricing_engine, DynamicPricingEngine

try:
    from .defects import defect_engine, QualityDefectRadarEngine
except ImportError:
    defect_engine = None
    QualityDefectRadarEngine = None

from .khata_gate import KhataWorkingCapitalGateEngine
from .andon_cord import TPSAndonCordEngine

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

