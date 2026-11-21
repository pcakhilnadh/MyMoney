import pytest
from tests.conftest import H


def test_application_routes_use_api_prefix_only(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert all(path == "/health" or path.startswith("/api/v1/") for path in paths)
    # Unversioned and retired routes are gone, including the combined sync.
    for path in ("/auth/me", "/api/auth/me", "/api/v1/sync/pull", "/api/v1/sync/push",
                 "/api/v1/plate/presence", "/money/accounts", "/food/catalog"):
        assert path not in paths
        assert client.get(path).status_code in (404, 405)
    for path in ("/api/v1/auth/me", "/api/v1/sync/money/pull", "/api/v1/money/accounts",
                 "/api/v1/food/catalog", "/api/v1/money/ai/expense"):
        assert path in paths


def test_money_routes_are_namespaced_and_api_auth_paths_remain(client):
    created = client.post("/api/v1/money/accounts", json={"name": "Cash"}, headers=H("alice"))
    assert created.status_code == 201
    assert client.get("/api/v1/money/accounts", headers=H("alice")).json()[0]["name"] == "Cash"
    assert client.get("/api/v1/auth/me", headers=H("alice")).status_code == 200
    assert client.get("/api/v1/accounts", headers=H("alice")).status_code == 404


@pytest.mark.usefixtures("food_access")
def test_food_entry_routes_exist_and_habit_routes_are_removed(client):
    assert client.get("/api/v1/food/entries", headers=H("alice")).status_code == 200
    for path in (
        "/api/v1/food/library",
        "/habits",
        "/api/v1/habits",
    ):
        assert client.get(path, headers=H("alice")).status_code == 404


@pytest.mark.usefixtures("food_access")
def test_sync_exposes_meal_logs_and_not_retired_habit_entities(client):
    pulled = client.get("/api/v1/sync/food/pull", headers=H("alice")).json()
    assert pulled["meal_logs"] == []
    for entity in ("food_entries", "food_library", "habits", "habit_logs"):
        assert entity not in pulled


def test_shared_sync_returns_group_and_invitation_snapshots(client):
    bob_email = client.get("/api/v1/auth/me", headers=H("bob")).json()["email"]
    group = client.post(
        "/api/v1/money/groups",
        json={"name": "Weekend trip"},
        headers=H("alice"),
    ).json()
    invited = client.post(
        f"/api/v1/money/groups/{group['id']}/members",
        json={"email": bob_email},
        headers=H("alice"),
    )
    assert invited.status_code == 201

    alice_pull = client.get("/api/v1/sync/money/pull", headers=H("alice")).json()
    bob_pull = client.get("/api/v1/sync/money/pull", headers=H("bob")).json()
    assert [item["id"] for item in alice_pull["groups"]] == [group["id"]]
    assert alice_pull["invitations"] == []
    assert bob_pull["groups"] == []
    assert [item["id"] for item in bob_pull["invitations"]] == [group["id"]]

    assert client.post(f"/api/v1/money/groups/{group['id']}/join", headers=H("bob")).status_code == 200
    bob_pull = client.get("/api/v1/sync/money/pull", headers=H("bob")).json()
    assert [item["id"] for item in bob_pull["groups"]] == [group["id"]]
    assert bob_pull["invitations"] == []
