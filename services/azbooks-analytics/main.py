"""
Main entry point for azbooks-analytics service.
FastAPI application with lifespan management and wastegate initialization.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.wastegate import wastegate
from .api.routes import router as api_router

logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("azbooks.analytics.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence: initialize wastegate temp directory
    logger.info(
        f"Starting {settings.service_name} v{settings.version} "
        f"[Wastegate Clamped: {settings.wastegate_max_memory}, {settings.wastegate_threads} threads]"
    )
    wastegate.clean_temp_directory()
    yield
    # Shutdown sequence: purge spilled partitions
    logger.info(f"Stopping {settings.service_name}...")
    wastegate.clean_temp_directory()


app = FastAPI(
    title="AZBooks Analytics Microservice",
    description="Vectorized OLAP compute isolation engine powered by DuckDB, Polars, and PyArrow.",
    version=settings.version,
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "status": "operational",
        "docs_url": "/docs",
        "health_url": "/api/v1/health",
        "wastegate_url": "/api/v1/wastegate/status",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "services.azbooks-analytics.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
