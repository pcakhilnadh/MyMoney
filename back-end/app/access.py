import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExpenseGroup, GroupMember, Profile


def membership(db: Session, group_id: uuid.UUID, user: Profile) -> GroupMember | None:
    return db.scalar(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user.id,
            GroupMember.status == "active",
        )
    )


def require_member(db: Session, group_id: uuid.UUID, user: Profile) -> GroupMember:
    m = membership(db, group_id, user)
    if m is None:
        # 404 rather than 403 so group existence is not leaked
        raise HTTPException(404, "Group not found")
    return m


def require_admin(db: Session, group_id: uuid.UUID, user: Profile) -> GroupMember:
    m = require_member(db, group_id, user)
    if m.role not in ("owner", "admin"):
        raise HTTPException(403, "Only owners or admins can do this")
    return m


def active_group(db: Session, group_id: uuid.UUID) -> ExpenseGroup:
    g = db.get(ExpenseGroup, group_id)
    if g is None or g.status != "active":
        raise HTTPException(404, "Group not found")
    return g
