"""add preferred currency to profiles

Revision ID: d9f0a2b6c3e1
Revises: c7d4a6b901e2
Create Date: 2026-11-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9f0a2b6c3e1"
down_revision: Union[str, Sequence[str], None] = "c7d4a6b901e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "preferred_currency",
            sa.String(length=3),
            server_default=sa.text("'INR'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "preferred_currency")
