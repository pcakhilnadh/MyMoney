import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AccountIn(BaseModel):
    name: str
    account_type: str = "cash"
    currency: str = "INR"
    opening_balance: int = 0
    credit_limit: int | None = Field(default=None, ge=0)
    is_default: bool = False


class AccountOut(AccountIn, ORM):
    id: uuid.UUID


class CategoryIn(BaseModel):
    name: str
    icon: str = "tag"
    color: str | None = None
    transaction_type: str = "expense"


class CategoryOut(CategoryIn, ORM):
    id: uuid.UUID
    is_system: bool


class SplitIn(BaseModel):
    user_id: uuid.UUID
    value: float | None = None  # amount_minor / percent / units depending on method
    paid_minor: int = Field(default=0, ge=0)


class SplitOut(ORM):
    user_id: uuid.UUID
    share_minor: int
    paid_minor: int


class TransactionIn(BaseModel):
    client_id: uuid.UUID | None = None
    context: str = "personal"
    transaction_type: str = "expense"
    group_id: uuid.UUID | None = None
    account_id: uuid.UUID
    category_id: uuid.UUID | None = None
    description: str
    merchant: str | None = None
    amount_minor: int = Field(gt=0)
    currency: str = "INR"
    transaction_date: datetime
    notes: str | None = None
    split_method: str | None = None
    splits: list[SplitIn] = []


class TransactionOut(ORM):
    id: uuid.UUID
    client_id: uuid.UUID | None
    owner_user_id: uuid.UUID
    context: str
    transaction_type: str
    group_id: uuid.UUID | None
    account_id: uuid.UUID | None
    category_id: uuid.UUID | None
    description: str
    merchant: str | None
    amount_minor: int
    currency: str
    transaction_date: datetime
    notes: str | None
    is_shared: bool
    split_method: str | None
    version: int
    splits: list[SplitOut] = []


class GroupIn(BaseModel):
    name: str
    description: str | None = None
    group_type: str = "friends"
    currency: str = "INR"


class MemberOut(ORM):
    id: uuid.UUID
    email: str
    user_id: uuid.UUID | None
    display_name: str | None
    role: str
    status: str


class GroupOut(ORM):
    id: uuid.UUID
    name: str
    description: str | None
    group_type: str
    currency: str
    created_by: uuid.UUID


class InviteIn(BaseModel):
    email: str
    role: str = "member"


class SettlementIn(BaseModel):
    client_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    receiver_user_id: uuid.UUID
    amount_minor: int = Field(gt=0)
    method: str = "upi"
    reference: str | None = None
    notes: str | None = None


class SettlementOut(ORM):
    id: uuid.UUID
    group_id: uuid.UUID | None
    payer_user_id: uuid.UUID
    receiver_user_id: uuid.UUID
    amount_minor: int
    method: str
    status: str
    notes: str | None
    settled_at: datetime | None


class BudgetIn(BaseModel):
    group_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    name: str
    amount_minor: int = Field(gt=0)
    period: str = "monthly"
    period_start: date
    period_end: date | None = None
    alert_threshold_percent: int = Field(default=80, ge=1, le=100)


class BudgetOut(BudgetIn, ORM):
    id: uuid.UUID
    is_active: bool
