"""add plan and app role to profiles

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

plan_enum = sa.Enum("free", "pro", name="profile_plan")
role_enum = sa.Enum("member", "owner", name="profile_role")


def upgrade() -> None:
    bind = op.get_bind()
    plan_enum.create(bind, checkfirst=True)
    role_enum.create(bind, checkfirst=True)
    # Existing users are backfilled to the defaults by server_default.
    op.add_column(
        "profiles",
        sa.Column("plan", plan_enum, server_default=sa.text("'free'"), nullable=False),
    )
    op.add_column(
        "profiles",
        sa.Column("role", role_enum, server_default=sa.text("'member'"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("profiles", "role")
    op.drop_column("profiles", "plan")
    bind = op.get_bind()
    role_enum.drop(bind, checkfirst=True)
    plan_enum.drop(bind, checkfirst=True)
