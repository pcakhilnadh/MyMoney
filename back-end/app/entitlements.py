from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import AppRole, Profile, RoleEntitlement

FEATURES = ("money", "food", "plate")

# Used when the entitlement table has not been seeded. Members only get My Money.
DEFAULT_ENTITLEMENTS: dict[str, tuple[str, ...]] = {
    AppRole.MEMBER.value: ("money",),
    AppRole.ADMIN.value: FEATURES,
    AppRole.OWNER.value: FEATURES,
}

ROLE_RANK = {AppRole.MEMBER: 0, AppRole.ADMIN: 1, AppRole.OWNER: 2}


def entitlements_for(db: Session, role: AppRole) -> list[str]:
    if role == AppRole.OWNER:
        return list(FEATURES)
    rows = db.scalars(select(RoleEntitlement)).all()
    if not rows:
        return list(DEFAULT_ENTITLEMENTS[role.value])
    return [f for f in FEATURES if any(r.role == role.value and r.feature == f for r in rows)]


def require_feature(feature: str):
    def dependency(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
        if feature not in entitlements_for(db, user.role):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your plan does not include this feature")

    return dependency


def require_owner(user: Profile = Depends(get_current_user)) -> Profile:
    if user.role != AppRole.OWNER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return user
