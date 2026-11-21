"""Per-app sync: My Money and My Food push/pull on their own, MyPlate pulls changes."""

import uuid
from datetime import date, timedelta

import pytest

from app import routers_plate
from tests.conftest import H
from tests.test_plate import meal_body, send, shared_kitchen

TODAY = date.today().isoformat()


@pytest.fixture
def c(client, food_access, monkeypatch):
    # Exact cursors, so a test can tell old rows from new ones.
    monkeypatch.setattr(routers_plate, "CURSOR_OVERLAP", timedelta(0))
    return client


def pull(c, user, since=None):
    params = {"since": since} if since else {}
    response = c.get("/api/v1/sync/plate/pull", headers=H(user), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def ids(rows):
    return [row["id"] for row in rows]


# ─── My Money / My Food ──────────────────────────────────────────────────────────────────

MEAL_LOG = {
    "id": "bbbbbbbb-0000-0000-0000-000000000001",
    "version": 1,
    "entry_date": "2026-11-20",
    "meal": "lunch",
    "food_id": "egg",
    "food_name": "Egg",
    "weight_g": 50,
}
ACCOUNT = {"id": "bbbbbbbb-0000-0000-0000-000000000002", "version": 1, "name": "Cash"}


def test_money_and_food_sync_separately(c):
    money = c.post("/api/v1/sync/money/push", json={"accounts": [ACCOUNT]}, headers=H("alice"))
    food = c.post("/api/v1/sync/food/push", json={"meal_logs": [MEAL_LOG]}, headers=H("alice"))
    assert money.status_code == food.status_code == 200
    assert food.json()["accepted"] == [{"entity": "meal_logs", "id": MEAL_LOG["id"]}]

    money_pull = c.get("/api/v1/sync/money/pull", headers=H("alice")).json()
    assert ids(money_pull["accounts"]) == [ACCOUNT["id"]]
    assert "meal_logs" not in money_pull and "groups" in money_pull
    food_pull = c.get("/api/v1/sync/food/pull", headers=H("alice")).json()
    assert ids(food_pull["meal_logs"]) == [MEAL_LOG["id"]]
    assert set(food_pull) == {"server_time", "meal_logs"}


def test_food_sync_needs_the_food_app(client):
    assert client.get("/api/v1/sync/food/pull", headers=H("alice")).status_code == 403
    assert client.get("/api/v1/sync/money/pull", headers=H("alice")).status_code == 200


# ─── MyPlate ─────────────────────────────────────────────────────────────────────────────


def test_first_pull_has_everything_to_show_myplate_offline(c):
    first = pull(c, "alice")
    assert first["me"]["name"] == "Alice"
    assert [k["name"] for k in first["kitchens"]] == ["My Kitchen"]
    assert first["full_kitchens"] == ids(first["kitchens"])
    assert first["settings"]["reminder_time"] == "20:00"
    assert first["meals"] == first["grocery_items"] == first["ideas"] == []
    assert first["invites"] == [] and first["contact_ids"] == []


def test_other_members_changes_arrive_as_deltas_with_deletions(c):
    kitchen = shared_kitchen(c)
    cursor = pull(c, "bob")["server_time"]

    meal_id, task_id = str(uuid.uuid4()), str(uuid.uuid4())
    body = meal_body(kitchen, id=meal_id, meal_date=TODAY, attendees=[])
    body["attendees"] = [m["user_id"] for m in pull(c, "alice")["kitchens"][1]["members"]]
    body["prep_tasks"] = [{"id": task_id, "title": "Soak rajma"}]
    saved = send(c, "alice", "POST", "/meals", body, 201).json()
    assert saved["id"] == meal_id and saved["prep_tasks"][0]["id"] == task_id
    item = send(
        c, "alice", "POST", "/grocery-items", {"id": str(uuid.uuid4()), "group_id": kitchen, "name": "Milk"}, 201
    ).json()

    delta = pull(c, "bob", cursor)
    assert delta["full_kitchens"] == []
    assert ids(delta["meals"]) == [meal_id] and ids(delta["grocery_items"]) == [item["id"]]

    # A tick only touches the task row, yet the meal is pulled again.
    cursor = delta["server_time"]
    send(c, "alice", "PATCH", f"/prep-tasks/{task_id}", {"done": True}, 200)
    ticked = pull(c, "bob", cursor)
    assert ticked["meals"][0]["prep_tasks"][0]["done_by"] is not None
    assert ticked["grocery_items"] == []

    cursor = ticked["server_time"]
    send(c, "alice", "PATCH", f"/grocery-items/{item['id']}", {"checked": True}, 200)
    send(c, "alice", "POST", "/grocery-items/clear-checked", {"group_ids": [kitchen]}, 204)
    send(c, "alice", "DELETE", f"/meals/{meal_id}", status=204)
    gone = pull(c, "bob", cursor)
    assert gone["deleted"] == {"meals": [meal_id], "grocery_items": [item["id"]], "ideas": []}


def test_retried_creates_return_the_saved_row(c):
    kitchen = next(k for k in pull(c, "alice")["kitchens"])["id"]
    item = {"id": str(uuid.uuid4()), "group_id": kitchen, "name": "Paneer"}
    first = send(c, "alice", "POST", "/grocery-items", item, 201).json()
    again = send(c, "alice", "POST", "/grocery-items", item, 201).json()
    assert first == again
    assert len(pull(c, "alice")["grocery_items"]) == 1

    idea = {"id": str(uuid.uuid4()), "group_id": kitchen, "title": "Biryani"}
    send(c, "alice", "POST", "/ideas", idea, 201)
    send(c, "alice", "POST", "/ideas", idea, 201)
    assert len(pull(c, "alice")["ideas"]) == 1

    # Someone else's id is refused rather than revealed.
    bobs = next(k for k in pull(c, "bob")["kitchens"])["id"]
    send(c, "bob", "POST", "/grocery-items", {**item, "group_id": bobs}, 409)


def test_votes_bump_the_idea_and_a_new_member_gets_the_whole_kitchen(c):
    kitchen = shared_kitchen(c)
    send(c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=TODAY, attendees=[], guest_count=1), 201)
    idea = send(c, "alice", "POST", "/ideas", {"group_id": kitchen, "title": "Dosa"}, 201).json()
    cursor = pull(c, "bob")["server_time"]
    send(c, "bob", "PUT", f"/ideas/{idea['id']}/vote", {"voted": True}, 200)
    assert len(pull(c, "alice", cursor)["ideas"][0]["votes"]) == 2

    # Carol joins after her last pull: the kitchen's history comes whole.
    carol_cursor = pull(c, "carol")["server_time"]
    code = send(c, "alice", "POST", f"/kitchens/{kitchen}/invite-code", status=200).json()["code"]
    send(c, "carol", "POST", "/invites/join", {"code": code}, 200)
    joined = pull(c, "carol", carol_cursor)
    assert joined["full_kitchens"] == [kitchen]
    assert len(joined["meals"]) == 1 and ids(joined["ideas"]) == [idea["id"]]

    # After leaving, the kitchen is simply missing; the phone drops it.
    send(c, "carol", "DELETE", f"/kitchens/{kitchen}/members/me", status=204)
    assert kitchen not in ids(pull(c, "carol", joined["server_time"])["kitchens"])


def test_old_meals_stay_on_the_server_and_stale_cursors_get_everything(c):
    kitchen = next(k for k in pull(c, "alice")["kitchens"])["id"]
    old = (date.today() - timedelta(weeks=12)).isoformat()
    send(c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=old), 201)
    send(c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=TODAY), 201)
    first = pull(c, "alice")
    assert [m["meal_date"] for m in first["meals"]] == [TODAY]
    assert first["meals_from"] <= TODAY

    stale = (date.today() - timedelta(days=90)).isoformat() + "T00:00:00+00:00"
    assert pull(c, "alice", stale)["full_kitchens"] == [kitchen]


def test_presence_lives_under_live(c):
    kitchen = shared_kitchen(c)
    response = c.put(
        "/api/v1/plate/live/presence",
        headers=H("bob"),
        json={"kitchen_ids": [kitchen], "shopping": True},
    )
    assert response.status_code == 200
    shared = next(k for k in pull(c, "alice")["kitchens"] if k["id"] == kitchen)
    assert len(shared["shopping_now"]) == 1


def test_deleting_a_meal_tells_other_phones_to_drop_its_leftovers(c):
    kitchen = shared_kitchen(c)
    members = [m["user_id"] for m in pull(c, "alice")["kitchens"][1]["members"]]
    dinner = send(
        c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=TODAY, attendees=members), 201
    ).json()
    left = send(c, "alice", "POST", f"/meals/{dinner['id']}/leftovers", status=201).json()
    cursor = pull(c, "bob")["server_time"]
    send(c, "alice", "DELETE", f"/meals/{dinner['id']}", status=204)
    assert sorted(pull(c, "bob", cursor)["deleted"]["meals"]) == sorted([dinner["id"], left["id"]])

