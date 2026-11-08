"""Add AI call audit and usage logs.

Revision ID: ab12cd34ef56
Revises: d9f0a2b6c3e1
"""
from alembic import op
import sqlalchemy as sa

revision = "ab12cd34ef56"
down_revision = "d9f0a2b6c3e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_call_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("task", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("request_payload", sa.JSON(), nullable=False),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ai_call_logs_user_id", "ai_call_logs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_call_logs_user_id", table_name="ai_call_logs")
    op.drop_table("ai_call_logs")
