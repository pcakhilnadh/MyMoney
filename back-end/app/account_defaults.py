from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Profile


def lock_account_defaults(db: Session, user_id: UUID) -> None:
    db.execute(select(Profile.id).where(Profile.id == user_id).with_for_update())


def clear_other_defaults(db: Session, user_id: UUID, account_id: UUID | None = None) -> None:
    query = select(Account).where(Account.user_id == user_id, Account.is_default.is_(True))
    if account_id is not None:
        query = query.where(Account.id != account_id)
    for account in db.scalars(query):
        account.is_default = False
        account.version += 1
        account.updated_at = datetime.now(timezone.utc)
    db.flush()
