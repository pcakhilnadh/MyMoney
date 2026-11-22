"""Members get My Plate; admins get My Food again

Revision ID: m4e5f6a7b8c9
Revises: l3d4e5f6a7b8
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op


revision: str = "m4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "l3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _grant(role: str, feature: str) -> None:
    op.execute(
        f"INSERT INTO role_entitlements (role, feature) SELECT '{role}', '{feature}'"
        " WHERE NOT EXISTS (SELECT 1 FROM role_entitlements"
        f" WHERE role = '{role}' AND feature = '{feature}')"
    )


def upgrade() -> None:
    _grant("member", "plate")
    _grant("admin", "food")


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_entitlements"
        " WHERE (role = 'member' AND feature = 'plate') OR (role = 'admin' AND feature = 'food')"
    )
