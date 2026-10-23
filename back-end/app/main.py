from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.db import engine
from app.routers import router as api_router
from app.routers_auth import router as auth_router
from app.sync import router as sync_router

app = FastAPI(title="MyMoney API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(api_router)
app.include_router(sync_router)

# Keep the existing local API paths while exposing a collision-free prefix
# for the frontend when both apps share a Vercel domain.
app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")
app.include_router(sync_router, prefix="/api")


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
    return {"status": "ok", "database": "connected"}
