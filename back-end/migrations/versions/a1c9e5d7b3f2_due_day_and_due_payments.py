"""payment due day and due payments

Revision ID: a1c9e5d7b3f2
Revises: f4c8a1d2e6b0
Create Date: 2026-10-24 16:55:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c9e5d7b3f2'
down_revision: Union[str, Sequence[str], None] = 'f4c8a1d2e6b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('accounts', sa.Column('payment_due_day', sa.Integer(), nullable=True))
    op.create_table(
        'due_payments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('amount_minor', sa.Integer(), nullable=False),
        sa.Column('interest_minor', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('paid_on', sa.Date(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('amount_minor > 0'),
        sa.CheckConstraint('interest_minor >= 0'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_due_payments_user_id'), 'due_payments', ['user_id'])
    op.create_index(op.f('ix_due_payments_account_id'), 'due_payments', ['account_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_due_payments_account_id'), table_name='due_payments')
    op.drop_index(op.f('ix_due_payments_user_id'), table_name='due_payments')
    op.drop_table('due_payments')
    op.drop_column('accounts', 'payment_due_day')
