import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.entitlements import entitlements_for, require_owner
from app.models import AppRole, Profile

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminMemberOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    plan: str
    created_at: datetime
    is_me: bool
    entitlements: list[str]


class RoleIn(BaseModel):
    # Ownership is not granted through the dashboard.
    role: Literal["member", "admin"]


def _out(p: Profile, me: Profile, db: Session) -> AdminMemberOut:
    return AdminMemberOut(
        id=p.id,
        email=p.email,
        role=p.role.value,
        plan=p.plan.value,
        created_at=p.created_at,
        is_me=p.id == me.id,
        entitlements=entitlements_for(db, p.role),
    )


@router.get("/members", response_model=list[AdminMemberOut])
def list_members(owner: Profile = Depends(require_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(Profile).order_by(Profile.created_at, Profile.email)).all()
    return [_out(p, owner, db) for p in rows]


@router.put("/members/{member_id}/role", response_model=AdminMemberOut)
def set_role(
    member_id: uuid.UUID,
    body: RoleIn,
    owner: Profile = Depends(require_owner),
    db: Session = Depends(get_db),
):
    target = db.get(Profile, member_id)
    if target is None:
        raise HTTPException(404, "Member not found")
    if target.role == AppRole.OWNER:
        raise HTTPException(409, "An owner's role cannot be changed here")
    target.role = AppRole(body.role)
    db.commit()
    db.refresh(target)
    return _out(target, owner, db)
