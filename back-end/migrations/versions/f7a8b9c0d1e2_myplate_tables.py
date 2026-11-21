"""MyPlate meal planning: kitchens, meals, prep, cart, ideas, settings

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts(name: str, nullable: bool = False) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade() -> None:
    op.create_table(
        "plate_kitchens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column("group_type", sa.String(16), nullable=False),
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("color", sa.String(9), nullable=False),
        sa.Column("meal_slots", sa.JSON(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("invite_code", sa.String(16), nullable=True, unique=True),
        _ts("last_activity_at", nullable=True),
        sa.Column("last_activity_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint(
            "group_type IN ('personal', 'couple', 'family', 'flatmates', 'friends')",
            name="ck_plate_kitchens_type",
        ),
    )
    op.create_index("ix_plate_kitchens_owner_id", "plate_kitchens", ["owner_id"])
    op.create_index(
        "uq_plate_kitchens_one_personal",
        "plate_kitchens",
        ["owner_id"],
        unique=True,
        postgresql_where=sa.text("is_personal = true"),
    )

    op.create_table(
        "plate_kitchen_members",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("color", sa.String(9), nullable=False),
        sa.Column("display_name", sa.String(60), nullable=True),
        sa.Column("avatar_url", sa.String(), nullable=True),
        _ts("last_seen_at", nullable=True),
        _ts("shopping_since", nullable=True),
        _ts("joined_at"),
        sa.UniqueConstraint("kitchen_id", "user_id", name="uq_plate_kitchen_members"),
        sa.CheckConstraint("role IN ('owner', 'member')", name="ck_plate_kitchen_members_role"),
    )
    op.create_index(
        "ix_plate_kitchen_members_kitchen_id", "plate_kitchen_members", ["kitchen_id"]
    )
    op.create_index("ix_plate_kitchen_members_user_id", "plate_kitchen_members", ["user_id"])

    op.create_table(
        "plate_kitchen_invites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("invited_user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("invited_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        _ts("created_at"),
        sa.UniqueConstraint("kitchen_id", "invited_user_id", name="uq_plate_kitchen_invites"),
    )
    op.create_index(
        "ix_plate_kitchen_invites_kitchen_id", "plate_kitchen_invites", ["kitchen_id"]
    )
    op.create_index(
        "ix_plate_kitchen_invites_invited_user_id", "plate_kitchen_invites", ["invited_user_id"]
    )

    op.create_table(
        "plate_meals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("meal_date", sa.Date(), nullable=False),
        sa.Column("meal_slot", sa.String(1), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("sides", sa.JSON(), nullable=False),
        sa.Column(
            "leftover_of",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("chef_type", sa.String(12), nullable=False),
        sa.Column("chef_user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=True),
        sa.Column("guest_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recipe_url", sa.String(500), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("meal_slot IN ('B', 'L', 'S', 'D')", name="ck_plate_meals_slot"),
        sa.CheckConstraint(
            "chef_type IN ('MEMBER', 'TOGETHER', 'TAKEOUT', 'EATING_OUT')",
            name="ck_plate_meals_chef_type",
        ),
        sa.CheckConstraint("guest_count >= 0", name="ck_plate_meals_guests"),
    )
    op.create_index("ix_plate_meals_kitchen_date", "plate_meals", ["kitchen_id", "meal_date"])

    op.create_table(
        "plate_meal_attendees",
        sa.Column(
            "meal_id",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), primary_key=True),
    )

    op.create_table(
        "plate_meal_reactions",
        sa.Column(
            "meal_id",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), primary_key=True),
        sa.Column("reaction", sa.String(8), nullable=False),
        sa.CheckConstraint("reaction IN ('heart', 'up')", name="ck_plate_meal_reactions"),
    )

    op.create_table(
        "plate_prep_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "meal_id",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("done_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=True),
        _ts("done_at", nullable=True),
    )
    op.create_index("ix_plate_prep_tasks_meal_id", "plate_prep_tasks", ["meal_id"])

    op.create_table(
        "plate_grocery_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("quantity", sa.String(40), nullable=False, server_default=""),
        sa.Column("aisle", sa.String(30), nullable=False),
        sa.Column(
            "meal_id",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("added_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("checked_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=True),
        _ts("checked_at", nullable=True),
        _ts("created_at"),
    )
    op.create_index("ix_plate_grocery_items_kitchen_id", "plate_grocery_items", ["kitchen_id"])

    op.create_table(
        "plate_ideas",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("recipe_url", sa.String(500), nullable=True),
        sa.Column("added_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        _ts("created_at"),
    )
    op.create_index("ix_plate_ideas_kitchen_id", "plate_ideas", ["kitchen_id"])

    op.create_table(
        "plate_idea_votes",
        sa.Column(
            "idea_id",
            sa.Uuid(),
            sa.ForeignKey("plate_ideas.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), primary_key=True),
    )

    op.create_table(
        "plate_settings",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), primary_key=True),
        sa.Column(
            "default_kitchen_id",
            sa.Uuid(),
            sa.ForeignKey("plate_kitchens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reminder_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reminder_time", sa.String(5), nullable=False, server_default="20:00"),
    )


def downgrade() -> None:
    for table in (
        "plate_settings",
        "plate_idea_votes",
        "plate_ideas",
        "plate_grocery_items",
        "plate_prep_tasks",
        "plate_meal_reactions",
        "plate_meal_attendees",
        "plate_meals",
        "plate_kitchen_invites",
        "plate_kitchen_members",
        "plate_kitchens",
    ):
        op.drop_table(table)
