import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


class Profile(Base):
    """User identity and preferences. Name and avatar are never stored here."""

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = _pk()
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    preferred_currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = _pk()
    google_sub: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String)
    picture: Mapped[str | None] = mapped_column(String)
    device: Mapped[str | None] = mapped_column(String)
    browser: Mapped[str | None] = mapped_column(String)
    location: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[int] = mapped_column(Integer)
    last_used_at: Mapped[int] = mapped_column(Integer)
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    access_expires_at: Mapped[int] = mapped_column(Integer)
    refresh_expires_at: Mapped[int] = mapped_column(Integer)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    account_type: Mapped[str] = mapped_column(String, default="cash")
    currency: Mapped[str] = mapped_column(String, default="INR")
    opening_balance: Mapped[int] = mapped_column(Integer, default=0)
    credit_limit: Mapped[int | None] = mapped_column(Integer)
    payment_due_day: Mapped[int | None] = mapped_column(Integer)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class DuePayment(Base):
    """Record that a credit card / loan due amount was paid on a date."""

    __tablename__ = "due_payments"
    __table_args__ = (CheckConstraint("amount_minor > 0"), CheckConstraint("interest_minor >= 0"))

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    interest_minor: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date] = mapped_column(Date)
    paid_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    icon: Mapped[str] = mapped_column(String, default="tag")
    color: Mapped[str | None] = mapped_column(String)
    transaction_type: Mapped[str] = mapped_column(String, default="expense", index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Merchant(Base):
    __tablename__ = "merchants"
    __table_args__ = (UniqueConstraint("normalized_name"),)

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String)
    normalized_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ExpenseGroup(Base):
    __tablename__ = "expense_groups"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    group_type: Mapped[str] = mapped_column(String, default="friends")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    currency: Mapped[str] = mapped_column(String, default="INR")
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    members: Mapped[list["GroupMember"]] = relationship(back_populates="group")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "email"),)

    id: Mapped[uuid.UUID] = _pk()
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("expense_groups.id"), index=True)
    email: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), index=True)
    display_name: Mapped[str | None] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="member")
    status: Mapped[str] = mapped_column(String, default="invited")
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    group: Mapped[ExpenseGroup] = relationship(back_populates="members")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0"),
        UniqueConstraint("owner_user_id", "client_id"),
    )

    id: Mapped[uuid.UUID] = _pk()
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    transfer_to_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"), index=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("expense_groups.id"), index=True)
    context: Mapped[str] = mapped_column(String, default="personal")
    transaction_type: Mapped[str] = mapped_column(String, default="expense")
    title: Mapped[str] = mapped_column(String)
    long_description: Mapped[str | None] = mapped_column(Text)
    merchant: Mapped[str | None] = mapped_column(String)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String, default="INR")
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    notes: Mapped[str | None] = mapped_column(String)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    split_method: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active")
    client_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    splits: Mapped[list["SplitAllocation"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )


class SplitAllocation(Base):
    __tablename__ = "split_allocations"
    __table_args__ = (
        UniqueConstraint("transaction_id", "user_id"),
        CheckConstraint("share_minor >= 0"),
        CheckConstraint("paid_minor >= 0"),
    )

    id: Mapped[uuid.UUID] = _pk()
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    share_minor: Mapped[int] = mapped_column(Integer)
    paid_minor: Mapped[int] = mapped_column(Integer, default=0)
    share_units: Mapped[int | None] = mapped_column(Integer)
    percentage: Mapped[float | None] = mapped_column(Numeric(5, 2))

    transaction: Mapped[Transaction] = relationship(back_populates="splits")


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        CheckConstraint("amount_minor > 0"),
        CheckConstraint("payer_user_id != receiver_user_id"),
    )

    id: Mapped[uuid.UUID] = _pk()
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("expense_groups.id"), index=True)
    payer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    receiver_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String, default="INR")
    method: Mapped[str] = mapped_column(String, default="upi")
    status: Mapped[str] = mapped_column(String, default="settled")
    reference: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(String)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (CheckConstraint("amount_minor > 0"),)

    id: Mapped[uuid.UUID] = _pk()
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), index=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("expense_groups.id"), index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String, default="INR")
    period: Mapped[str] = mapped_column(String, default="monthly")
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    alert_threshold_percent: Mapped[int] = mapped_column(Integer, default=80)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
