"""Ensure at most one default account per user.

Revision ID: a10b20c30d40
Revises: f1a2b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa

revision = "a10b20c30d40"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        UPDATE accounts SET is_default = false, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE is_default = true AND (
            status != 'active' OR id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY user_id ORDER BY updated_at DESC, id DESC
                    ) AS rank
                    FROM accounts WHERE is_default = true AND status = 'active'
                ) AS ranked WHERE rank > 1
            )
        )
    """))
    op.create_index(
        "uq_accounts_user_default", "accounts", ["user_id"], unique=True,
        postgresql_where=sa.text("is_default = true"),
        sqlite_where=sa.text("is_default = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_accounts_user_default", table_name="accounts")
