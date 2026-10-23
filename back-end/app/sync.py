"""Push/pull endpoints for the local-first client.

Records carry a client-generated uuid (used as the primary key) and a `version`.
A pushed record wins when its version is higher than the server's; otherwise the server
copy is returned as a conflict and the client adopts it.
"""

import uuid
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import audit
from app.auth import get_current_user
from app.category_rules import transfer_category_account_error
from app.db import get_db
from app.models import Account, Budget, Category, Merchant, Profile, Transaction

router = APIRouter(prefix="/sync", tags=["sync"], dependencies=[Depends(get_current_user)])


class Rec(BaseModel):
    id: uuid.UUID
    version: int = Field(ge=1)
    status: str = "active"


class AccountRec(Rec):
    name: str
    account_type: str = "cash"
    currency: str = "INR"
    opening_balance: int = 0
    credit_limit: int | None = Field(default=None, ge=0)
    is_default: bool = False


class CategoryRec(Rec):
    name: str
    icon: str = "tag"
    color: str | None = None
    transaction_type: Literal["expense", "income", "transfer"] = "expense"
    is_system: bool = False
    is_hidden: bool = False


class TransactionRec(Rec):
    account_id: uuid.UUID
    transfer_to_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    context: str = "personal"
    transaction_type: str = "expense"
    title: str = Field(validation_alias=AliasChoices("title", "description"))
    long_description: str | None = None
    merchant: str | None = None
    amount_minor: int = Field(gt=0)
    currency: str = "INR"
    transaction_date: datetime
    notes: str | None = None


class BudgetRec(Rec):
    category_id: uuid.UUID | None = None
    name: str
    amount_minor: int = Field(gt=0)
    currency: str = "INR"
    period: str = "monthly"
    period_start: date
    period_end: date | None = None
    alert_threshold_percent: int = Field(default=80, ge=1, le=100)
    is_active: bool = True


class MerchantSyncRec(Rec):
    name: str


class PushIn(BaseModel):
    categories: list[CategoryRec] = []
    accounts: list[AccountRec] = []
    merchants: list[MerchantSyncRec] = []
    transactions: list[TransactionRec] = []
    budgets: list[BudgetRec] = []


# entity name -> (model, owner column, fields copied from the record)
SPECS = {
    "categories": (
        Category,
        "user_id",
        ["name", "icon", "color", "transaction_type", "is_system", "is_hidden"],
    ),
    "accounts": (
        Account,
        "user_id",
        ["name", "account_type", "currency", "opening_balance", "credit_limit", "is_default"],
    ),
    "merchants": (Merchant, "user_id", ["name"]),
    "transactions": (
        Transaction,
        "owner_user_id",
        [
            "account_id",
            "transfer_to_account_id",
            "category_id",
            "transaction_type",
            "title",
            "long_description",
            "merchant",
            "amount_minor",
            "currency",
            "transaction_date",
            "notes",
        ],
    ),
    "budgets": (
        Budget,
        "owner_user_id",
        [
            "category_id",
            "name",
            "amount_minor",
            "currency",
            "period",
            "period_start",
            "period_end",
            "alert_threshold_percent",
            "is_active",
        ],
    ),
}


def _owned_ref(db: Session, model, owner_col: str, ref_id, user: Profile) -> bool:
    return ref_id is None or (
        (row := db.get(model, ref_id)) is not None and getattr(row, owner_col) == user.id
    )


def _upsert(db: Session, user: Profile, name: str, rec: Rec, result: dict) -> None:
    model, owner_col, fields = SPECS[name]
    data = {f: getattr(rec, f) for f in fields}
    if name == "transactions":
        if rec.context != "personal":  # group data goes through /transactions
            raise HTTPException(422, "Only personal transactions can be synced")
        account = db.get(Account, rec.account_id)
        if account is None or account.user_id != user.id or account.status != "active":
            raise HTTPException(422, "Unknown account")
        destination = (
            db.get(Account, rec.transfer_to_account_id) if rec.transfer_to_account_id else None
        )
        if rec.transaction_type == "transfer":
            if (
                destination is None
                or rec.transfer_to_account_id == rec.account_id
                or destination.user_id != user.id
                or destination.status != "active"
            ):
                raise HTTPException(422, "A different active destination account is required")
        elif rec.transfer_to_account_id is not None:
            raise HTTPException(422, "Only transfers can have a destination account")
        if rec.transaction_type not in {"expense", "income", "refund", "transfer"}:
            raise HTTPException(422, "Unsupported transaction type")
        if not _owned_ref(db, Category, "user_id", rec.category_id, user):
            raise HTTPException(422, "Unknown account or category")
        if rec.category_id:
            category = db.get(Category, rec.category_id)
            expected_type = "expense" if rec.transaction_type == "refund" else rec.transaction_type
            if category.transaction_type != expected_type:
                raise HTTPException(422, "Category does not match the transaction type")
            if rec.transaction_type == "transfer":
                error = transfer_category_account_error(
                    category.name, account.account_type, destination.account_type
                )
                if error:
                    raise HTTPException(422, error)
    existing = db.get(model, rec.id)
    if existing is not None and getattr(existing, owner_col) != user.id:
        raise HTTPException(404, "Record not found")
    if existing is None:
        extra = {"created_by": user.id} if name in ("transactions", "budgets") else {}
        row = model(id=rec.id, **{owner_col: user.id}, **extra, **data)
        if name == "transactions":
            row.context = "personal"
        row.status = rec.status
        row.version = rec.version
        db.add(row)
        db.flush()
        audit(db, user, name, rec.id, "sync_create")
    elif rec.version > existing.version:
        for k, v in data.items():
            setattr(existing, k, v)
        existing.status = rec.status
        existing.version = rec.version
        if name == "transactions" and rec.status == "deleted":
            existing.deleted_at = datetime.now(timezone.utc)
        audit(db, user, name, rec.id, "sync_update")
    elif rec.version < existing.version:
        result["conflicts"].append({"entity": name, "id": str(rec.id)})
    result["accepted"].append({"entity": name, "id": str(rec.id)})


@router.post("/push")
def push(body: PushIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    result: dict = {"accepted": [], "conflicts": []}
    # parents before children so foreign keys resolve
    for name in ("categories", "accounts", "merchants", "transactions", "budgets"):
        for rec in getattr(body, name):
            _upsert(db, user, name, rec, result)
        db.flush()
    db.commit()
    return result


def _out(row, fields: list[str]) -> dict:
    d = {f: getattr(row, f) for f in ["id", "version", "status", "created_at", "updated_at", *fields]}
    return d


@router.get("/pull")
def pull(
    since: datetime | None = None,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server_time = datetime.now(timezone.utc)
    out: dict = {"server_time": server_time}
    for name, (model, owner_col, fields) in SPECS.items():
        q = select(model).where(getattr(model, owner_col) == user.id)
        if name == "transactions":
            q = q.where(Transaction.context == "personal")
        if since is not None:
            q = q.where(model.updated_at > since)
        out[name] = [_out(r, fields) for r in db.scalars(q)]
    return out
