"""MyPlate: remember cravings that were planned

A craving leaves the list once it's planned. This keeps who suggested it, who voted, who
planned it and the meal, for future group insights.

Revision ID: l3d4e5f6a7b8
Revises: k2c3d4e5f6a7
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "k2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plate_craving_fulfilments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "kitchen_id",
            sa.Uuid(),
            sa.ForeignKey("plate_kitchens.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("suggested_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("voters", sa.JSON(), nullable=False),
        sa.Column("planned_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column(
            "meal_id",
            sa.Uuid(),
            sa.ForeignKey("plate_meals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("suggested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_plate_craving_fulfilments_kitchen",
        "plate_craving_fulfilments",
        ["kitchen_id", "fulfilled_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_plate_craving_fulfilments_kitchen", table_name="plate_craving_fulfilments")
    op.drop_table("plate_craving_fulfilments")
