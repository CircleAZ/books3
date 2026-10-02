"""
Configuration and settings for azbooks-analytics service.
"""

import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent


class AnalyticsSettings(BaseModel):
    service_name: str = "azbooks-analytics"
    version: str = "1.0.0"
    host: str = os.getenv("ANALYTICS_HOST", "127.0.0.1")
    port: int = int(os.getenv("ANALYTICS_PORT", "8001"))
    debug: bool = os.getenv("ANALYTICS_DEBUG", "False").lower() in ("true", "1")

    # The Mechanical Wastegate Constraints
    # Clamps DuckDB to 220MB on a 512MB RAM tier, spilling partitions to disk
    wastegate_max_memory: str = os.getenv("WASTEGATE_MAX_MEMORY", "220MB")
    wastegate_threads: int = int(os.getenv("WASTEGATE_THREADS", "2"))
    wastegate_preserve_insertion_order: bool = False
    temp_directory: str = os.getenv(
        "WASTEGATE_TEMP_DIR",
        str(BASE_DIR / ".duckdb_temp")
    )

    # Database Read Configuration
    database_url: str = os.getenv("DATABASE_URL", "")
    statement_timeout_ms: int = int(os.getenv("ANALYTICS_STATEMENT_TIMEOUT_MS", "6000"))


settings = AnalyticsSettings()
