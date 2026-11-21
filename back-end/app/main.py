from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.db import engine
from app.versions import CURRENT, VERSIONS

__version__ = "1.1.0"

app = FastAPI(title="MyTracker API", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# /api/v1/... ; see app/versions.py for adding a version without breaking older apps.
for name, router in VERSIONS.items():
    app.include_router(router, prefix=f"/api/{name}")


@app.get("/health", response_model=None)
def health() -> dict[str, str] | JSONResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected"},
        )
    return {"status": "ok", "database": "connected", "version": __version__, "api": CURRENT}
