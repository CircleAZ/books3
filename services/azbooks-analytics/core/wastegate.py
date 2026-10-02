"""
The Mechanical Wastegate: DuckDB Forced-Induction Clamping Engine.
Regulates memory consumption, thread pools, and partition disk spilling.
"""

import os
import shutil
import logging
from pathlib import Path
from contextlib import contextmanager
import duckdb
from .config import settings

logger = logging.getLogger("azbooks.analytics.wastegate")


class MechanicalWastegate:
    """
    Spring-loaded memory regulator for DuckDB vectorized execution.
    Clamps memory to prevent process termination under aggressive analytical compute.
    """

    def __init__(self):
        self.max_memory = settings.wastegate_max_memory
        self.threads = settings.wastegate_threads
        self.temp_dir = Path(settings.temp_directory)
        self._init_temp_directory()

    def _init_temp_directory(self):
        try:
            self.temp_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"Could not create custom temp directory {self.temp_dir}: {e}")

    def clean_temp_directory(self):
        """Purges any residual spilled partition files from previous runs."""
        if self.temp_dir.exists():
            for child in self.temp_dir.glob("*"):
                try:
                    if child.is_file():
                        child.unlink()
                    elif child.is_dir():
                        shutil.rmtree(child)
                except Exception as e:
                    logger.debug(f"Failed to delete temp file {child}: {e}")

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        """
        Instantiates a DuckDB connection locked by the mechanical wastegate.
        """
        conn = duckdb.connect(database=":memory:")
        # Spring-loaded clamps:
        conn.execute(f"SET max_memory = '{self.max_memory}';")
        conn.execute(f"SET threads = {self.threads};")
        conn.execute("SET preserve_insertion_order = false;")

        if self.temp_dir.exists():
            # Escape Windows backslashes for DuckDB SQL parser
            safe_temp_path = str(self.temp_dir.resolve()).replace("\\", "/")
            conn.execute(f"SET temp_directory = '{safe_temp_path}';")

        return conn

    @contextmanager
    def connection_scope(self):
        """
        Context manager ensuring connections are closed and resources freed.
        """
        conn = self.get_connection()
        try:
            yield conn
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def get_status(self) -> dict:
        """
        Inspects live wastegate regulation metrics.
        """
        with self.connection_scope() as conn:
            config_df = conn.execute(
                "SELECT name, value FROM duckdb_settings() "
                "WHERE name IN ('max_memory', 'threads', 'preserve_insertion_order', 'temp_directory');"
            ).df()

            settings_map = dict(zip(config_df['name'], config_df['value']))

        temp_disk_usage = sum(f.stat().st_size for f in self.temp_dir.glob("**/*") if f.is_file()) if self.temp_dir.exists() else 0

        return {
            "wastegate_active": True,
            "max_memory": settings_map.get("max_memory", self.max_memory),
            "threads": int(settings_map.get("threads", self.threads)),
            "preserve_insertion_order": settings_map.get("preserve_insertion_order") == "false",
            "temp_directory": settings_map.get("temp_directory", str(self.temp_dir)),
            "spill_disk_bytes": temp_disk_usage,
        }


# Singleton instance
wastegate = MechanicalWastegate()
