import importlib
from io import StringIO

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError


migration = importlib.import_module("migrations.versions.a10b20c30d40_unique_default_account")


def test_migration_cleans_legacy_defaults_and_enforces_uniqueness():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE accounts (id TEXT PRIMARY KEY, user_id TEXT, status TEXT, "
            "is_default BOOLEAN, version INTEGER, updated_at TEXT)"
        ))
        conn.execute(text(
            "INSERT INTO accounts VALUES "
            "('old', 'a', 'active', 1, 1, '2026-01-01'), "
            "('new', 'a', 'active', 1, 1, '2026-02-01'), "
            "('inactive', 'a', 'archived', 1, 1, '2026-03-01'), "
            "('other', 'b', 'active', 1, 1, '2026-01-01')"
        ))
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        rows = {row.id: (row.is_default, row.version) for row in conn.execute(
            text("SELECT id, is_default, version FROM accounts")
        )}
        assert rows == {"old": (0, 2), "new": (1, 1), "inactive": (0, 2), "other": (1, 1)}
        with pytest.raises(IntegrityError):
            conn.execute(text("UPDATE accounts SET is_default = 1 WHERE id = 'old'"))
        with Operations.context(MigrationContext.configure(conn)):
            migration.downgrade()
        conn.execute(text("UPDATE accounts SET is_default = 1 WHERE id = 'old'"))


def test_migration_emits_postgresql_partial_index():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    assert "CREATE UNIQUE INDEX uq_accounts_user_default ON accounts (user_id) WHERE is_default = true" in output.getvalue()
