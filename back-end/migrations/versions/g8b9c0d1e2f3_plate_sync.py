"""MyPlate sync: change times on cart items and ideas, and a log of deletions

Phones keep MyPlate locally and pull only what changed since their last sync, so every
synced row needs a change time, and deleted rows leave a short-lived tombstone.

Revision ID: g8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-11-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHANGED = ("plate_grocery_items", "plate_ideas")


def upgrade() -> None:
    for table in CHANGED:
        op.add_column(table, sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
        op.execute(f"UPDATE {table} SET updated_at = created_at")
        with op.batch_alter_table(table) as batch:
            batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    for table in ("plate_meals", *CHANGED):
        op.create_index(f"ix_{table}_kitchen_updated", table, ["kitchen_id", "updated_at"])

    op.create_table(
        "plate_deletions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "kitchen_id",
            sa.Uuid(),
            sa.ForeignKey("plate_kitchens.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "entity IN ('meals', 'grocery_items', 'ideas')", name="ck_plate_deletions_entity"
        ),
    )
    op.create_index(
        "ix_plate_deletions_kitchen_deleted", "plate_deletions", ["kitchen_id", "deleted_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_plate_deletions_kitchen_deleted", table_name="plate_deletions")
    op.drop_table("plate_deletions")
    for table in ("plate_meals", *CHANGED):
        op.drop_index(f"ix_{table}_kitchen_updated", table_name=table)
    for table in CHANGED:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("updated_at")
