"""How people get into a money group or a kitchen. Both apps use these rules.

Each app keeps one member row per person in its own table (`group_members`,
`plate_kitchen_members`), with an email, a user once they've joined, and a status:

- `invited`: someone invited this email. Whoever signs in with it sees the invite.
- `active`:  a member.
- `inactive`: left (money groups only; kitchens remove the row).

There are two ways in, and either works with or without an invite:
- accepting an invite sent to my email;
- a join code: 6 case-sensitive letters and digits, no expiry, one per group or kitchen.
"""

import re
import secrets
import string
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CODE_ALPHABET = string.ascii_letters + string.digits
CODE_LENGTH = 6


def normalize_email(value: str) -> str:
    """Emails match without regard to case or surrounding spaces."""
    return value.strip().lower()


def valid_email(value: str) -> bool:
    return len(value) <= 320 and EMAIL.match(value) is not None


def join_code(db: Session, owner: Any) -> str:
    """The row's join code, created on first use. `owner` has an `invite_code` column."""
    model = type(owner)
    while owner.invite_code is None:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if db.scalar(select(model.id).where(model.invite_code == code)) is None:
            owner.invite_code = code
            db.commit()
    return owner.invite_code


def find_by_code(db: Session, model: Any, code: str) -> Any | None:
    """Case-sensitive: "aB3x9Q" and "AB3X9Q" are different codes."""
    return db.scalar(select(model).where(model.invite_code == code.strip()))


InviteOutcome = Literal["invited", "already_invited", "already_member"]


def invite(
    db: Session,
    member_model: Any,
    parent: dict[str, Any],
    email: str,
    invited_by: Any,
    **fields: Any,
) -> tuple[Any, InviteOutcome]:
    """Invite an email to the group or kitchen named by `parent` (its foreign key column
    and value, e.g. {"group_id": id}). Someone who left can be invited again."""
    email = normalize_email(email)
    row = _row(db, member_model, parent, email=email)
    if row is not None and row.status == "active":
        return row, "already_member"
    if row is not None and row.status == "invited":
        return row, "already_invited"
    if row is None:
        row = member_model(**parent, email=email)
        db.add(row)
    row.status = "invited"
    row.invited_by = invited_by
    row.joined_at = None
    for name, value in fields.items():
        setattr(row, name, value)
    return row, "invited"


def join(
    db: Session,
    member_model: Any,
    parent: dict[str, Any],
    user_id: Any,
    email: str,
    **fields: Any,
) -> Any:
    """Make this user an active member, taking over an invite to their email if there is
    one. Joining again changes nothing. `fields` apply only when the row becomes active."""
    email = normalize_email(email)
    row = _row(db, member_model, parent, user_id=user_id) or _row(
        db, member_model, parent, email=email
    )
    if row is not None and row.status == "active":
        return row
    if row is None:
        row = member_model(**parent, email=email)
        db.add(row)
    row.user_id = user_id
    row.email = email
    row.status = "active"
    row.joined_at = datetime.now(timezone.utc)
    for name, value in fields.items():
        setattr(row, name, value)
    return row


def invites_for(db: Session, member_model: Any, email: str):
    """Query for the invites waiting for this email."""
    return select(member_model).where(
        member_model.email == normalize_email(email), member_model.status == "invited"
    )


def _row(db: Session, member_model: Any, parent: dict[str, Any], **match: Any) -> Any | None:
    filters = [getattr(member_model, k) == v for k, v in {**parent, **match}.items()]
    return db.scalar(select(member_model).where(*filters))
