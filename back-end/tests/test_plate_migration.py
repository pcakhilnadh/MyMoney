import importlib
from io import StringIO

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect

from app.db import Base
from app.models import Profile

tables = importlib.import_module("migrations.versions.f7a8b9c0d1e2_myplate_tables")
sync = importlib.import_module("migrations.versions.g8b9c0d1e2f3_plate_sync")
emails = importlib.import_module("migrations.versions.h9c0d1e2f3a4_plate_email_invites")
shared = importlib.import_module("migrations.versions.i0a1b2c3d4e5_shared_memberships")
PLATE_TABLES = sorted(t for t in Base.metadata.tables if t.startswith("plate_"))


def test_postgresql_sql_has_the_one_personal_kitchen_index_and_checks():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        tables.upgrade()
        sync.upgrade()
        emails.upgrade()
        shared.upgrade()
        shared.downgrade()
        emails.downgrade()
        sync.downgrade()
        tables.downgrade()
    sql = output.getvalue()
    assert "CREATE UNIQUE INDEX uq_plate_kitchens_one_personal" in sql
    assert "WHERE is_personal = true" in sql
    assert "CONSTRAINT ck_plate_meals_chef_type CHECK" in sql
    assert "ON DELETE SET NULL" in sql and "ON DELETE CASCADE" in sql
    assert "UPDATE plate_ideas SET updated_at = created_at" in sql
    assert "CREATE INDEX ix_plate_meals_kitchen_updated" in sql
    assert "ADD COLUMN invited_email VARCHAR(320)" in sql
    assert "DROP TABLE plate_kitchen_invites" in sql
    assert "ADD COLUMN invite_code VARCHAR(16)" in sql
    for table in PLATE_TABLES:
        assert f"DROP TABLE {table}" in sql
    assert "plate_kitchen_invites" not in PLATE_TABLES


def test_migrations_match_the_models_and_reverse():
    engine = create_engine("sqlite://")
    Profile.__table__.create(engine)
    with engine.begin() as connection:  # as it was before join codes
        connection.exec_driver_sql(
            "CREATE TABLE expense_groups (id CHAR(32) PRIMARY KEY, name VARCHAR NOT NULL)"
        )

    def run(*steps):
        with engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                for step in steps:
                    step()

    run(tables.upgrade)
    # A cart item saved before sync existed gets its creation time as its change time.
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO profiles (id, google_sub, email, plan, role, created_at)"
            " VALUES ('p1', 's', 'a@b.c', 'free', 'member', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_kitchens (id, name, emoji, group_type, is_personal, owner_id,"
            " color, meal_slots, timezone, created_at, updated_at) VALUES ('k1', 'K', 'x',"
            " 'personal', 1, 'p1', '#fff', '[]', 'UTC', '2026-11-01', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_grocery_items (id, kitchen_id, name, quantity, aisle, added_by,"
            " created_at) VALUES ('g1', 'k1', 'Milk', '', 'Other', 'p1', '2026-11-02')"
        )
    run(sync.upgrade, emails.upgrade)
    # A member, and a pending invite made before invites moved into the members table.
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO profiles (id, google_sub, email, plan, role, created_at)"
            " VALUES ('p2', 's2', 'Bob@Gmail.com', 'free', 'member', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_kitchen_members (id, kitchen_id, user_id, role, color, joined_at)"
            " VALUES ('m1', 'k1', 'p1', 'owner', '#fff', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_kitchen_invites (id, kitchen_id, invited_user_id, invited_by,"
            " created_at) VALUES ('i1', 'k1', 'p2', 'p1', '2026-11-03')"
        )
    run(shared.upgrade)
    with engine.connect() as connection:
        rows = connection.exec_driver_sql(
            "SELECT id, email, status, user_id FROM plate_kitchen_members ORDER BY id"
        ).all()
    assert [tuple(r) for r in rows] == [
        ("i1", "bob@gmail.com", "invited", None),
        ("m1", "a@b.c", "active", "p1"),
    ]
    with engine.connect() as connection:
        assert connection.exec_driver_sql(
            "SELECT updated_at FROM plate_grocery_items"
        ).scalar_one().startswith("2026-11-02")

    inspector = inspect(engine)
    assert sorted(t for t in inspector.get_table_names() if t.startswith("plate_")) == PLATE_TABLES
    for table in PLATE_TABLES:
        migrated = {c["name"] for c in inspector.get_columns(table)}
        modelled = {c.name for c in Base.metadata.tables[table].columns}
        assert migrated == modelled, table
        migrated_indexes = {i["name"] for i in inspector.get_indexes(table)}
        modelled_indexes = {i.name for i in Base.metadata.tables[table].indexes}
        assert modelled_indexes <= migrated_indexes, table

    run(shared.downgrade)
    assert "plate_kitchen_invites" in inspect(engine).get_table_names()
    run(emails.downgrade)
    assert "invited_email" not in {
        c["name"] for c in inspect(engine).get_columns("plate_kitchen_invites")
    }
    run(sync.downgrade)
    assert "updated_at" not in {c["name"] for c in inspect(engine).get_columns("plate_ideas")}
    run(tables.downgrade)
    assert not [t for t in inspect(engine).get_table_names() if t.startswith("plate_")]
