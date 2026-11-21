"""Admins get My Money and My Plate, not My Food

Revision ID: k2c3d4e5f6a7
Revises: j1b2c3d4e5f6
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op


revision: str = "k2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "j1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM role_entitlements WHERE role = 'admin' AND feature = 'food'")


def downgrade() -> None:
    op.execute(
        "INSERT INTO role_entitlements (role, feature) SELECT 'admin', 'food'"
        " WHERE NOT EXISTS (SELECT 1 FROM role_entitlements"
        " WHERE role = 'admin' AND feature = 'food')"
    )
