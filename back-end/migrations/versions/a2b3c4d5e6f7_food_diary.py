"""Persist food diary entries and user calorie goals.

Revision ID: a2b3c4d5e6f7
Revises: a10b20c30d40
"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "a10b20c30d40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "food_goals",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), primary_key=True),
        sa.Column("calories", sa.Integer(), nullable=False),
        sa.CheckConstraint("calories > 0"),
    )
    op.create_table(
        "food_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("meal", sa.String(20), nullable=False),
        sa.Column("food_id", sa.String(), nullable=False),
        sa.Column("food_name", sa.String(), nullable=False),
        sa.Column("weight_g", sa.Numeric(12, 3), nullable=False),
        sa.Column("calories", sa.Numeric(12, 3)),
        sa.Column("protein", sa.Numeric(12, 3)),
        sa.Column("carbs", sa.Numeric(12, 3)),
        sa.Column("fat", sa.Numeric(12, 3)),
        sa.CheckConstraint("weight_g > 0"),
        sa.CheckConstraint("meal IN ('breakfast', 'lunch', 'snacks', 'dinner')"),
    )
    op.create_index("ix_food_entries_user_date", "food_entries", ["user_id", "entry_date"])


def downgrade() -> None:
    op.drop_index("ix_food_entries_user_date", table_name="food_entries")
    op.drop_table("food_entries")
    op.drop_table("food_goals")
