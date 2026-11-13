"""Rename food entries to user_meal_log and add sync metadata.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("food_entries", "user_meal_log")
    op.drop_index("ix_food_entries_user_date", table_name="user_meal_log")
    op.create_index("ix_user_meal_log_user_date", "user_meal_log", ["user_id", "entry_date"])
    op.add_column("user_meal_log", sa.Column("image", sa.Text(), nullable=True))
    for column in ("calories_100g", "protein_100g", "carbs_100g", "fat_100g"):
        op.add_column("user_meal_log", sa.Column(column, sa.Numeric(), nullable=True))
    op.add_column(
        "user_meal_log",
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
    )
    op.add_column(
        "user_meal_log",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "user_meal_log",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        "user_meal_log",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_meal_log", "updated_at")
    op.drop_column("user_meal_log", "created_at")
    op.drop_column("user_meal_log", "version")
    op.drop_column("user_meal_log", "status")
    for column in ("fat_100g", "carbs_100g", "protein_100g", "calories_100g"):
        op.drop_column("user_meal_log", column)
    op.drop_column("user_meal_log", "image")
    op.drop_index("ix_user_meal_log_user_date", table_name="user_meal_log")
    op.create_index("ix_food_entries_user_date", "user_meal_log", ["user_id", "entry_date"])
    op.rename_table("user_meal_log", "food_entries")
