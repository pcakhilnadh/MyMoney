"""add persistent authentication sessions

Revision ID: e3a4c1b29d70
Revises: b7e1c43d5a90
Create Date: 2026-10-23 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3a4c1b29d70"
down_revision: Union[str, Sequence[str], None] = "b7e1c43d5a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("google_sub", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("picture", sa.String(), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("access_expires_at", sa.Integer(), nullable=False),
        sa.Column("refresh_expires_at", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_auth_sessions_access_token_hash"),
        "auth_sessions",
        ["access_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_auth_sessions_google_sub"),
        "auth_sessions",
        ["google_sub"],
        unique=False,
    )
    op.create_index(
        op.f("ix_auth_sessions_refresh_token_hash"),
        "auth_sessions",
        ["refresh_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_sessions_refresh_token_hash"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_google_sub"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_access_token_hash"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
