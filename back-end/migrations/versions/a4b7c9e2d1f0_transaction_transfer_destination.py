"""add transaction transfer destination

Revision ID: a4b7c9e2d1f0
Revises: 8d1a23f592b9
Create Date: 2026-10-23 13:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b7c9e2d1f0"
down_revision: Union[str, Sequence[str], None] = "8d1a23f592b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table(
        "transactions",
        table_args=(sa.CheckConstraint("amount_minor > 0"),),
    ) as batch_op:
        batch_op.add_column(sa.Column("transfer_to_account_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_transactions_transfer_to_account_id_accounts",
            "accounts",
            ["transfer_to_account_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "transactions",
        table_args=(sa.CheckConstraint("amount_minor > 0"),),
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_transactions_transfer_to_account_id_accounts", type_="foreignkey"
        )
        batch_op.drop_column("transfer_to_account_id")
