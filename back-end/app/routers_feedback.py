import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import GoogleIdentity, get_current_user, get_identity
from app.db import get_db
from app.models import Feedback, Profile

router = APIRouter(
    prefix="/feedback",
    tags=["feedback"],
    dependencies=[Depends(get_current_user)],
)

MAX_BODY = 500
FEED_LIMIT = 10


class FeedbackIn(BaseModel):
    kind: Literal["feedback", "testimony", "feature_request"]
    body: str

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty")
        if len(value) > MAX_BODY:
            raise ValueError(f"Message must be {MAX_BODY} characters or fewer")
        return value


class FeedbackOut(BaseModel):
    id: uuid.UUID
    first_name: str
    kind: str
    body: str
    created_at: datetime
    is_mine: bool


def _first_name(identity: GoogleIdentity) -> str:
    parts = (identity.name or "").split()
    return parts[0][:60] if parts else "Someone"


def _out(row: Feedback, user: Profile) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        first_name=row.first_name,
        kind=row.kind,
        body=row.body,
        created_at=row.created_at,
        is_mine=row.user_id == user.id,
    )


@router.get("", response_model=list[FeedbackOut])
def list_feedback(
    limit: int = Query(FEED_LIMIT, ge=1, le=FEED_LIMIT),
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The latest messages, oldest first so they read like a conversation."""
    rows = db.scalars(
        select(Feedback).order_by(Feedback.created_at.desc(), Feedback.id).limit(limit)
    ).all()
    return [_out(r, user) for r in reversed(rows)]


@router.post("", response_model=FeedbackOut, status_code=201)
def create_feedback(
    body: FeedbackIn,
    user: Profile = Depends(get_current_user),
    identity: GoogleIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
):
    row = Feedback(
        user_id=user.id, first_name=_first_name(identity), kind=body.kind, body=body.body
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row, user)
