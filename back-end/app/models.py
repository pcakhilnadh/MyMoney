import uuid
from enum import StrEnum
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


class Plan(StrEnum):
    FREE = "free"
    PRO = "pro"


class AppRole(StrEnum):
    """Ranked owner > admin > member."""

    MEMBER = "member"
    ADMIN = "admin"
    OWNER = "owner"


def _str_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    # Persist the lowercase values ("free"), not the member names ("FREE").
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class Profile(Base):
    """User identity and preferences. Name and avatar are never stored here."""

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = _pk()
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    preferred_currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")
    plan: Mapped[Plan] = mapped_column(
        _str_enum(Plan, "profile_plan"), default=Plan.FREE, server_default=Plan.FREE.value
    )
    role: Mapped[AppRole] = mapped_column(
        _str_enum(AppRole, "profile_role"), default=AppRole.MEMBER, server_default=AppRole.MEMBER.value
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FoodGoal(Base):
    __tablename__ = "food_goals"
    __table_args__ = (CheckConstraint("calories > 0"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)
    calories: Mapped[int] = mapped_column(Integer)


class UserMealLog(Base):
    """A meal item logged in a user's food diary. Merged through the sync engine."""

    __tablename__ = "user_meal_log"
    __table_args__ = (
        CheckConstraint("weight_g > 0"),
        CheckConstraint("meal IN ('breakfast', 'lunch', 'snacks', 'dinner')"),
        Index("ix_user_meal_log_user_date", "user_id", "entry_date"),
    )

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    entry_date: Mapped[date] = mapped_column(Date)
    meal: Mapped[str] = mapped_column(String(20))
    food_id: Mapped[str] = mapped_column(String)
    food_name: Mapped[str] = mapped_column(String)
    weight_g: Mapped[float] = mapped_column(Numeric(12, 3))
    calories: Mapped[float | None] = mapped_column(Numeric(12, 3))
    protein: Mapped[float | None] = mapped_column(Numeric(12, 3))
    carbs: Mapped[float | None] = mapped_column(Numeric(12, 3))
    fat: Mapped[float | None] = mapped_column(Numeric(12, 3))
    calories_100g: Mapped[float | None] = mapped_column(Numeric)
    protein_100g: Mapped[float | None] = mapped_column(Numeric)
    carbs_100g: Mapped[float | None] = mapped_column(Numeric)
    fat_100g: Mapped[float | None] = mapped_column(Numeric)
    image: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class AICallLog(Base):
    __tablename__ = "ai_call_logs"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    task: Mapped[str] = mapped_column(String)
    provider: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    request_payload: Mapped[dict] = mapped_column(JSON)
    response_payload: Mapped[dict | None] = mapped_column(JSON)
    http_status: Mapped[int | None] = mapped_column(Integer)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    elapsed_ms: Mapped[int | None] = mapped_column(Integer, default=None)


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
    __table_args__ = (
        Index(
            "uq_accounts_user_default",
            "user_id",
            unique=True,
            postgresql_where=text("is_default = true"),
            sqlite_where=text("is_default = 1"),
        ),
    )

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
    # Join code: 6 case-sensitive letters and digits, no expiry (app/memberships.py).
    invite_code: Mapped[str | None] = mapped_column(String(16), unique=True)
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


class FeedbackKind(StrEnum):
    FEEDBACK = "feedback"
    TESTIMONY = "testimony"
    FEATURE_REQUEST = "feature_request"


class Feedback(Base):
    """A public message in the shared feedback / testimony / feature-request conversation."""

    __tablename__ = "feedback_messages"
    __table_args__ = (
        CheckConstraint("length(body) <= 500", name="ck_feedback_body_len"),
        Index("ix_feedback_messages_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    # Only the first name is stored; the full name is never exposed to other users.
    first_name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RoleEntitlement(Base):
    """A feature (app area) a role may use. Owners always have every feature."""

    __tablename__ = "role_entitlements"

    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    feature: Mapped[str] = mapped_column(String(30), primary_key=True)


# ---------------------------------------------------------------------------------------
# MyPlate (meal planning). The UI calls a group a "kitchen". Users are host-app profiles.
# ---------------------------------------------------------------------------------------

KITCHEN_TYPES = ("personal", "couple", "family", "flatmates", "friends")
MEAL_SLOTS = ("B", "L", "S", "D")
CHEF_TYPES = ("MEMBER", "TOGETHER", "TAKEOUT", "EATING_OUT")
REACTIONS = ("heart", "up")


def _in(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    allowed = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({allowed})", name=name)


class PlateKitchen(Base):
    """A kitchen: its own week, cart, ideas and members. My Kitchen is the personal one."""

    __tablename__ = "plate_kitchens"
    __table_args__ = (
        # Exactly one My Kitchen per user.
        Index(
            "uq_plate_kitchens_one_personal",
            "owner_id",
            unique=True,
            postgresql_where=text("is_personal = true"),
            sqlite_where=text("is_personal = 1"),
        ),
        _in("group_type", KITCHEN_TYPES, "ck_plate_kitchens_type"),
    )

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String(60))
    emoji: Mapped[str] = mapped_column(String(16))
    group_type: Mapped[str] = mapped_column(String(16))
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), index=True)
    color: Mapped[str] = mapped_column(String(9))
    meal_slots: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["B", "L", "D"])
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    invite_code: Mapped[str | None] = mapped_column(String(16), unique=True)
    # Drives "new activity" on the Kitchens list.
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    # One table, Money-style: members are the active rows, invites the invited ones.
    members: Mapped[list["PlateKitchenMember"]] = relationship(
        primaryjoin="and_(PlateKitchen.id == PlateKitchenMember.kitchen_id, "
        "PlateKitchenMember.status == 'active')",
        back_populates="kitchen",
        cascade="all, delete-orphan",
        order_by="PlateKitchenMember.joined_at",
    )
    invites: Mapped[list["PlateKitchenMember"]] = relationship(
        primaryjoin="and_(PlateKitchen.id == PlateKitchenMember.kitchen_id, "
        "PlateKitchenMember.status == 'invited')",
        cascade="all, delete-orphan",
        order_by="PlateKitchenMember.created_at",
        overlaps="members,kitchen",
    )


class PlateKitchenMember(Base):
    """Someone in a kitchen, or invited to it. Same shape as money `group_members`; see
    `app/memberships.py`. Rows are removed when someone leaves or declines."""

    __tablename__ = "plate_kitchen_members"
    __table_args__ = (
        UniqueConstraint("kitchen_id", "user_id", name="uq_plate_kitchen_members"),
        UniqueConstraint("kitchen_id", "email", name="uq_plate_kitchen_members_email"),
        _in("role", ("owner", "member"), "ck_plate_kitchen_members_role"),
        _in("status", ("invited", "active"), "ck_plate_kitchen_members_status"),
    )

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plate_kitchens.id"), index=True)
    # Lower-cased. An invite has an email and no user until it's accepted.
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="active")
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    role: Mapped[str] = mapped_column(String(10), default="member")
    color: Mapped[str | None] = mapped_column(String(9))
    # First name and picture from the member's last visit, for when no session has them.
    display_name: Mapped[str | None] = mapped_column(String(60))
    avatar_url: Mapped[str | None] = mapped_column(String)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set while the member is live as shopping; presence lapses after an hour.
    shopping_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    kitchen: Mapped[PlateKitchen] = relationship(back_populates="members", overlaps="invites")


class PlateMeal(Base):
    """`meal_plans`: one dish in a kitchen's slot on a day."""

    __tablename__ = "plate_meals"
    __table_args__ = (
        Index("ix_plate_meals_kitchen_date", "kitchen_id", "meal_date"),
        Index("ix_plate_meals_kitchen_updated", "kitchen_id", "updated_at"),
        _in("meal_slot", MEAL_SLOTS, "ck_plate_meals_slot"),
        _in("chef_type", CHEF_TYPES, "ck_plate_meals_chef_type"),
        CheckConstraint("guest_count >= 0", name="ck_plate_meals_guests"),
    )

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plate_kitchens.id"))
    meal_date: Mapped[date] = mapped_column(Date)
    meal_slot: Mapped[str] = mapped_column(String(1))
    title: Mapped[str] = mapped_column(String(120))
    sides: Mapped[list[str]] = mapped_column(JSON, default=list)
    leftover_of: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="SET NULL")
    )
    chef_type: Mapped[str] = mapped_column(String(12))
    chef_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    guest_count: Mapped[int] = mapped_column(Integer, default=0)
    recipe_url: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    attendees: Mapped[list["PlateMealAttendee"]] = relationship(cascade="all, delete-orphan")
    reactions: Mapped[list["PlateMealReaction"]] = relationship(cascade="all, delete-orphan")
    prep_tasks: Mapped[list["PlatePrepTask"]] = relationship(
        cascade="all, delete-orphan", order_by="PlatePrepTask.sort_order"
    )


class PlateMealAttendee(Base):
    __tablename__ = "plate_meal_attendees"

    meal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)


class PlateMealReaction(Base):
    __tablename__ = "plate_meal_reactions"
    __table_args__ = (_in("reaction", REACTIONS, "ck_plate_meal_reactions"),)

    meal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)
    reaction: Mapped[str] = mapped_column(String(8))


class PlatePrepTask(Base):
    """Pre-prep for the day before (soak rajma). Ticks record who did it."""

    __tablename__ = "plate_prep_tasks"

    id: Mapped[uuid.UUID] = _pk()
    meal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    done_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlateGroceryItem(Base):
    __tablename__ = "plate_grocery_items"
    __table_args__ = (Index("ix_plate_grocery_items_kitchen_updated", "kitchen_id", "updated_at"),)

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plate_kitchens.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[str] = mapped_column(String(40), default="")
    aisle: Mapped[str] = mapped_column(String(30))
    # The meal it was added for ("Fri Dinner"); null for quick adds.
    meal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="SET NULL")
    )
    added_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    checked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class PlateIdea(Base):
    """`cravings`: a private wishlist in My Kitchen, a vote in shared kitchens."""

    __tablename__ = "plate_ideas"
    __table_args__ = (Index("ix_plate_ideas_kitchen_updated", "kitchen_id", "updated_at"),)

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plate_kitchens.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    recipe_url: Mapped[str | None] = mapped_column(String(500))
    added_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Bumped on votes too, so other members' phones pull the change.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    votes: Mapped[list["PlateIdeaVote"]] = relationship(cascade="all, delete-orphan")


class PlateIdeaVote(Base):
    __tablename__ = "plate_idea_votes"

    idea_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_ideas.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)


class PlateSettings(Base):
    """`user_myplate_settings`. A null default kitchen means "All kitchens"."""

    __tablename__ = "plate_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"), primary_key=True)
    default_kitchen_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plate_kitchens.id", ondelete="SET NULL")
    )
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_time: Mapped[str] = mapped_column(String(5), default="20:00")


PLATE_SYNCED = ("meals", "grocery_items", "ideas")


class PlateDeletion(Base):
    """Tombstone for a deleted meal, cart item or idea, so other phones drop it on sync."""

    __tablename__ = "plate_deletions"
    __table_args__ = (
        Index("ix_plate_deletions_kitchen_deleted", "kitchen_id", "deleted_at"),
        _in("entity", PLATE_SYNCED, "ck_plate_deletions_entity"),
    )

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_kitchens.id", ondelete="CASCADE")
    )
    entity: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[uuid.UUID] = mapped_column()
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PlateCravingFulfilment(Base):
    """A craving that was planned as a meal. Kept when the craving leaves the list, for
    future group insights (e.g. how often someone plans another member's craving)."""

    __tablename__ = "plate_craving_fulfilments"
    __table_args__ = (Index("ix_plate_craving_fulfilments_kitchen", "kitchen_id", "fulfilled_at"),)

    id: Mapped[uuid.UUID] = _pk()
    kitchen_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plate_kitchens.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(120))
    # Who wanted it: whoever suggested it, and everyone who voted for it.
    suggested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    voters: Mapped[list[str]] = mapped_column(JSON, default=list)
    planned_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id"))
    meal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plate_meals.id", ondelete="SET NULL")
    )
    suggested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fulfilled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

