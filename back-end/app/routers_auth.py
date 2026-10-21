from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models import Profile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(user: Profile = Depends(get_current_user)) -> dict[str, str]:
    return {"id": str(user.id), "email": user.email}
