"""add auth session device metadata and activity timestamps

Revision ID: 2b7c1d9e4f60
Revises: f4c8a1d2e6b0, a1c9e5d7b3f2
Create Date: 2026-10-24 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2b7c1d9e4f60"
down_revision: Union[str, Sequence[str], None] = ("f4c8a1d2e6b0", "a1c9e5d7b3f2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("device", sa.String(), nullable=True))
    op.add_column("auth_sessions", sa.Column("browser", sa.String(), nullable=True))
    op.add_column("auth_sessions", sa.Column("location", sa.String(), nullable=True))
    op.add_column("auth_sessions", sa.Column("created_at", sa.Integer(), nullable=True))
    op.add_column("auth_sessions", sa.Column("last_used_at", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE auth_sessions SET created_at = access_expires_at - 900, "
        "last_used_at = access_expires_at - 900"
    )
    with op.batch_alter_table("auth_sessions") as batch_op:
        batch_op.alter_column("created_at", nullable=False)
        batch_op.alter_column("last_used_at", nullable=False)


def downgrade() -> None:
    op.drop_column("auth_sessions", "last_used_at")
    op.drop_column("auth_sessions", "created_at")
    op.drop_column("auth_sessions", "location")
    op.drop_column("auth_sessions", "browser")
    op.drop_column("auth_sessions", "device")
