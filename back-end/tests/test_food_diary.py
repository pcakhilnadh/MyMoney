import importlib
from io import StringIO

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, insert, text

from app.food_search import catalog
from tests.conftest import H
from tests.test_food_catalog import create_writable_catalog


def test_meal_log_migration_generates_reversible_postgresql_sql():
    migration = importlib.import_module("migrations.versions.b3c4d5e6f7a8_user_meal_log_sync")
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "ALTER TABLE food_entries RENAME TO user_meal_log" in sql
    for column in ("calories_100g", "protein_100g", "carbs_100g", "fat_100g", "image"):
        assert f"ADD COLUMN {column} " in sql
        assert f"DROP COLUMN {column}" in sql
    assert "ALTER TABLE user_meal_log RENAME TO food_entries" in sql


def test_meal_log_migration_runs_and_preserves_rows_on_downgrade():
    diary = importlib.import_module("migrations.versions.a2b3c4d5e6f7_food_diary")
    migration = importlib.import_module("migrations.versions.b3c4d5e6f7a8_user_meal_log_sync")
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE profiles (id CHAR(32) PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            diary.upgrade()
            migration.upgrade()
            conn.execute(text(
                "INSERT INTO user_meal_log "
                "(id, user_id, entry_date, meal, food_id, food_name, weight_g, calories_100g) "
                "VALUES ('1', 'user', '2026-10-23', 'breakfast', 'egg', 'Egg', 50, 150)"
            ))
            assert conn.execute(text(
                "SELECT status, version, calories_100g, image FROM user_meal_log"
            )).one() == ("active", 1, 150, None)
            migration.downgrade()
            assert conn.execute(text("SELECT food_name, weight_g FROM food_entries")).one() == ("Egg", 50)
            diary.downgrade()


def test_food_entries_snapshot_nutrition_and_are_private(client):
    create_writable_catalog(client)
    with client.session_factory() as db:
        db.execute(insert(catalog), [
            {"id": "egg", "base_food_name": "Egg", "calories_100g": 150,
             "protein_100g": 12, "carbs_100g": 1, "fat_100g": 10},
            {"id": "unknown", "base_food_name": "Unknown", "calories_100g": None,
             "protein_100g": None, "carbs_100g": None, "fat_100g": None},
        ])
        db.commit()
    body = {"entry_date": "2026-10-23", "meal": "breakfast", "items": [
        {"food_id": "egg", "weight_g": 50}, {"food_id": "unknown", "weight_g": 120},
    ]}
    assert client.post("/api/food/entries", json=body).status_code == 401
    response = client.post("/api/food/entries", json=body, headers=H("alice"))
    assert response.status_code == 201
    egg, unknown = response.json()
    assert (egg["calories"], egg["protein"], egg["carbs"], egg["fat"]) == (75, 6, 0.5, 5)
    assert (egg["calories_100g"], egg["protein_100g"], egg["carbs_100g"], egg["fat_100g"]) == (150, 12, 1, 10)
    assert unknown["calories"] is None
    assert unknown["calories_100g"] is None
    assert len(client.get("/api/food/entries", headers=H("alice")).json()) == 2
    assert client.get("/api/food/entries", headers=H("bob")).json() == []
    with client.session_factory() as db:
        db.execute(catalog.update().where(catalog.c.id == "egg").values(calories_100g=200))
        db.commit()
    assert next(item for item in client.get("/api/food/entries", headers=H("alice")).json() if item["food_id"] == "egg")["calories"] == 75
    assert next(item for item in client.get("/api/food/entries", headers=H("alice")).json() if item["food_id"] == "egg")["calories_100g"] == 150


def test_food_entry_validation_is_atomic_and_goal_is_user_scoped(client):
    create_writable_catalog(client)
    with client.session_factory() as db:
        db.execute(insert(catalog).values(id="egg", base_food_name="Egg", calories_100g=150))
        db.commit()
    url = "/api/food/entries"
    body = {"entry_date": "2026-10-23", "meal": "lunch", "items": [{"food_id": "egg", "weight_g": 100}]}
    for bad in (0, -1, "NaN", 1000001):
        assert client.post(url, json={**body, "items": [{"food_id": "egg", "weight_g": bad}]}, headers=H("alice")).status_code == 422
    assert client.post(url, json={**body, "meal": "other"}, headers=H("alice")).status_code == 422
    assert client.post(url, json={**body, "items": body["items"] + [{"food_id": "missing", "weight_g": 1}]}, headers=H("alice")).status_code == 404
    assert client.get(url, headers=H("alice")).json() == []
    goal = "/api/food/goal"
    assert client.get(goal, headers=H("alice")).json() == {"calories": None}
    assert client.put(goal, json={"calories": 0}, headers=H("alice")).status_code == 422
    assert client.put(goal, json={"calories": 2000}, headers=H("alice")).json() == {"calories": 2000}
    assert client.put(goal, json={"calories": 1800}, headers=H("alice")).json() == {"calories": 1800}
    assert client.get(goal, headers=H("bob")).json() == {"calories": None}
