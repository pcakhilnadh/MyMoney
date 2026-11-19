"""admin role and role entitlements

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED = {
    "member": ["money"],
    "admin": ["money", "food", "plate"],
    "owner": ["money", "food", "plate"],
}


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # ADD VALUE cannot run inside a transaction block.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'admin'")
    table = op.create_table(
        "role_entitlements",
        sa.Column("role", sa.String(20), primary_key=True),
        sa.Column("feature", sa.String(30), primary_key=True),
    )
    op.bulk_insert(
        table, [{"role": r, "feature": f} for r, features in SEED.items() for f in features]
    )


def downgrade() -> None:
    op.drop_table("role_entitlements")
    # Postgres cannot drop an enum value; existing 'admin' profiles are demoted instead.
    op.execute("UPDATE profiles SET role = 'member' WHERE role = 'admin'")
