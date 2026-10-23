"""add category hidden state

Revision ID: c62d3a4f9b10
Revises: a4b7c9e2d1f0
Create Date: 2026-10-23 14:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c62d3a4f9b10"
down_revision: Union[str, Sequence[str], None] = "a4b7c9e2d1f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("categories", "is_hidden", server_default=None)


def downgrade() -> None:
    op.drop_column("categories", "is_hidden")
