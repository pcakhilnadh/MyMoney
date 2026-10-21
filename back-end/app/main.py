from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import router as api_router
from app.routers_auth import router as auth_router
from app.sync import router as sync_router

app = FastAPI(title="MyMoney API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
