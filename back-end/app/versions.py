"""API versions. Each version is one router, mounted at /api/<version> by `app.main`.

v1 is the whole API today. For a breaking change, add v2: build it from v1's routers and
swap in only the ones that change, mount both, and keep v1 until installed apps have moved.
Additive changes (new routes, new optional fields) stay in the current version.
"""

from fastapi import APIRouter

from app.ai.expense import router as ai_router
from app.ai.food import router as food_ai_router
from app.routers_admin import router as admin_router
from app.routers_auth import router as auth_router
from app.routers_feedback import router as feedback_router
from app.routers_food import router as food_router
from app.routers_money import router as money_router
from app.routers_plate import router as plate_router, sync_router as plate_sync_router
from app.sync import router as sync_router

CURRENT = "v1"


def _version(*routers: APIRouter) -> APIRouter:
    version = APIRouter()
    for router in routers:
        version.include_router(router)
    return version


v1 = _version(
    auth_router,
    sync_router,
    money_router,
    feedback_router,
    admin_router,
    food_router,
    plate_router,
    plate_sync_router,
    ai_router,
    food_ai_router,
)

# Every version still served, oldest first.
VERSIONS: dict[str, APIRouter] = {"v1": v1}
