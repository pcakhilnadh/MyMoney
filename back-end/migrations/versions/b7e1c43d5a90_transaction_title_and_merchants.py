"""rename transaction description and add merchants

Revision ID: b7e1c43d5a90
Revises: c62d3a4f9b10
Create Date: 2026-10-23 17:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e1c43d5a90"
down_revision: Union[str, Sequence[str], None] = "c62d3a4f9b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.alter_column(
            "description",
            new_column_name="title",
            existing_type=sa.String(),
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("long_description", sa.Text(), nullable=True))

    op.create_table(
        "merchants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name"),
    )
    op.create_index(op.f("ix_merchants_user_id"), "merchants", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_merchants_user_id"), table_name="merchants")
    op.drop_table("merchants")
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("long_description")
        batch_op.alter_column(
            "title",
            new_column_name="description",
            existing_type=sa.String(),
            existing_nullable=False,
        )
