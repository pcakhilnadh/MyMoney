from tests.conftest import H


def test_application_routes_use_api_prefix_only(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert all(path == "/health" or path.startswith("/api/") for path in paths)
    for path in ("/auth/me", "/sync/pull", "/money/accounts", "/food/catalog", "/money/ai/expense"):
        assert path not in paths
        assert client.get(path).status_code == 404
    for path in ("/api/auth/me", "/api/sync/pull", "/api/money/accounts",
                 "/api/food/catalog", "/api/money/ai/expense"):
        assert path in paths


def test_money_routes_are_namespaced_and_api_auth_paths_remain(client):
    created = client.post("/api/money/accounts", json={"name": "Cash"}, headers=H("alice"))
    assert created.status_code == 201
    assert client.get("/api/money/accounts", headers=H("alice")).json()[0]["name"] == "Cash"
    assert client.get("/api/auth/me", headers=H("alice")).status_code == 200
    assert client.get("/api/accounts", headers=H("alice")).status_code == 404


def test_food_and_habit_api_routes_are_removed(client):
    for path in (
        "/api/food/entries",
        "/api/food/library",
        "/habits",
        "/api/habits",
    ):
        assert client.get(path, headers=H("alice")).status_code == 404


def test_sync_no_longer_exposes_food_or_habit_entities(client):
    pulled = client.get("/api/sync/pull", headers=H("alice")).json()
    for entity in ("food_entries", "food_library", "habits", "habit_logs"):
        assert entity not in pulled


def test_shared_sync_returns_group_and_invitation_snapshots(client):
    bob_email = client.get("/api/auth/me", headers=H("bob")).json()["email"]
    group = client.post(
        "/api/money/groups",
        json={"name": "Weekend trip"},
        headers=H("alice"),
    ).json()
    invited = client.post(
        f"/api/money/groups/{group['id']}/members",
        json={"email": bob_email},
        headers=H("alice"),
    )
    assert invited.status_code == 201

    alice_pull = client.get("/api/sync/pull", headers=H("alice")).json()
    bob_pull = client.get("/api/sync/pull", headers=H("bob")).json()
    assert [item["id"] for item in alice_pull["groups"]] == [group["id"]]
    assert alice_pull["invitations"] == []
    assert bob_pull["groups"] == []
    assert [item["id"] for item in bob_pull["invitations"]] == [group["id"]]

    assert client.post(f"/api/money/groups/{group['id']}/join", headers=H("bob")).status_code == 200
    bob_pull = client.get("/api/sync/pull", headers=H("bob")).json()
    assert [item["id"] for item in bob_pull["groups"]] == [group["id"]]
    assert bob_pull["invitations"] == []
