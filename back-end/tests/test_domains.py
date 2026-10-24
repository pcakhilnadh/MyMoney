from tests.conftest import H


def test_money_routes_are_namespaced_and_api_auth_paths_remain(client):
    created = client.post("/api/money/accounts", json={"name": "Cash"}, headers=H("alice"))
    assert created.status_code == 201
    assert client.get("/api/money/accounts", headers=H("alice")).json()[0]["name"] == "Cash"
    assert client.get("/api/auth/me", headers=H("alice")).status_code == 200
    assert client.get("/api/accounts", headers=H("alice")).status_code == 404


def test_food_entries_and_library_are_user_scoped(client):
    headers = H("alice")
    response = client.post(
        "/api/food/entries",
        json={
            "entry_date": "2026-10-24",
            "meal": "breakfast",
            "name": " Oatmeal ",
            "quantity": 1.5,
            "unit": "serving",
        },
        headers=headers,
    )
    assert response.status_code == 201
    entry_id = response.json()["id"]
    assert response.json()["name"] == "Oatmeal"
    assert client.get("/api/food/entries", headers=H("alice")).json()[0]["id"] == entry_id
    assert client.get("/api/food/entries", headers=H("bob")).json() == []
    assert client.delete(f"/api/food/entries/{entry_id}", headers=H("bob")).status_code == 404

    item = client.post(
        "/food/library", json={"name": " Greek Yogurt "}, headers=headers
    )
    assert item.status_code == 201
    assert item.json()["name"] == "Greek Yogurt"
    assert client.get("/food/library", headers=H("bob")).json() == []


def test_habits_and_logs_are_user_scoped(client):
    response = client.post(
        "/api/habits",
        json={"name": "Walk", "frequency": "weekly", "target_per_week": 4},
        headers=H("alice"),
    )
    assert response.status_code == 201
    habit_id = response.json()["id"]
    assert response.json()["target_per_week"] == 4
    assert client.get("/habits", headers=H("alice")).json()[0]["id"] == habit_id

    logged = client.put(
        f"/api/habits/{habit_id}/logs",
        json={"logged_on": "2026-10-24", "completed": True},
        headers=H("alice"),
    )
    assert logged.status_code == 200
    assert logged.json()["habit_id"] == habit_id
    assert client.get(f"/api/habits/{habit_id}/logs", headers=H("bob")).status_code == 404
    assert client.put(
        f"/api/habits/{habit_id}",
        json={"name": "Walk", "frequency": "weekly", "target_per_week": 3},
        headers=H("alice"),
    ).json()["target_per_week"] == 3


def test_shared_sync_accepts_food_and_habit_entities(client):
    response = client.post(
        "/api/sync/push",
        json={
            "food_entries": [
                {
                    "id": "aaaaaaaa-0000-0000-0000-000000000021",
                    "version": 1,
                    "entry_date": "2026-10-24",
                    "meal": "lunch",
                    "name": "Rice bowl",
                    "quantity": 1,
                    "unit": "bowl",
                }
            ],
            "food_library": [
                {
                    "id": "aaaaaaaa-0000-0000-0000-000000000022",
                    "version": 1,
                    "name": "Rice bowl",
                }
            ],
            "habits": [
                {
                    "id": "aaaaaaaa-0000-0000-0000-000000000023",
                    "version": 1,
                    "name": "Read",
                    "frequency": "daily",
                    "target_per_week": 7,
                }
            ],
            "habit_logs": [
                {
                    "id": "aaaaaaaa-0000-0000-0000-000000000024",
                    "version": 1,
                    "habit_id": "aaaaaaaa-0000-0000-0000-000000000023",
                    "logged_on": "2026-10-24",
                    "completed": True,
                }
            ],
        },
        headers=H("alice"),
    )
    assert response.status_code == 200
    pulled = client.get("/api/sync/pull", headers=H("alice")).json()
    assert pulled["food_entries"][0]["name"] == "Rice bowl"
    assert pulled["food_library"][0]["normalized_name"] == "rice bowl"
    assert pulled["habits"][0]["name"] == "Read"
    assert pulled["habit_logs"][0]["completed"] is True
    assert client.get("/api/sync/pull", headers=H("bob")).json()["habits"] == []


def test_sync_rejects_habit_log_for_another_users_habit(client):
    habit_id = "aaaaaaaa-0000-0000-0000-000000000031"
    client.post(
        "/sync/push",
        json={
            "habits": [
                {
                    "id": habit_id,
                    "version": 1,
                    "name": "Read",
                    "frequency": "daily",
                    "target_per_week": 7,
                }
            ]
        },
        headers=H("alice"),
    )
    result = client.post(
        "/sync/push",
        json={
            "habit_logs": [
                {
                    "id": "aaaaaaaa-0000-0000-0000-000000000032",
                    "version": 1,
                    "habit_id": habit_id,
                    "logged_on": "2026-10-24",
                    "completed": True,
                }
            ]
        },
        headers=H("bob"),
    )
    assert result.status_code == 422
