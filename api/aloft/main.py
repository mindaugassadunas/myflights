from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from aloft.logging import configure_logging, get_logger
from aloft.routes.resolve import router as resolve_router
from aloft.routes.schedule import router as schedule_router
from aloft.routes.tracks import router as tracks_router

configure_logging()
log = get_logger("aloft.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("aloft.startup")
    yield
    log.info("aloft.shutdown")


app = FastAPI(
    title="Aloft API",
    version="0.1.0",
    description="OpenSky resolution pipeline, Gmail parser, and heavy jobs.",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aloft-api"}


app.include_router(resolve_router)
app.include_router(schedule_router)
app.include_router(tracks_router)
