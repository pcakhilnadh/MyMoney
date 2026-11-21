from datetime import date, datetime, timedelta, timezone

import pytest

from app import plate_recipes
from app.models import PlateKitchenMember
from tests.conftest import H

TODAY = date(2026, 11, 20)  # a Friday
D = lambda offset=0: (TODAY + timedelta(days=offset)).isoformat()  # noqa: E731


@pytest.fixture
def c(client, food_access):
    return client


def get(c, user, path, **params):
    response = c.get(f"/api/v1/plate{path}", headers=H(user), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def send(c, user, method, path, body=None, status=None):
    response = c.request(method, f"/api/v1/plate{path}", headers=H(user), json=body)
    if status is not None:
        assert response.status_code == status, response.text
    return response


def personal(c, user):
    return next(k for k in get(c, user, "/kitchens") if k["is_personal"])


def me(c, user):
    return get(c, user, "/me")["id"]


def shared_kitchen(c, owner="alice", joiner="bob", name="Home"):
    """Owner creates a kitchen; joiner comes in with its code."""
    kitchen = send(
        c, owner, "POST", "/kitchens", {"name": name, "group_type": "couple"}, 201
    ).json()
    code = send(c, owner, "POST", f"/kitchens/{kitchen['id']}/invite-code", status=200).json()
    send(c, joiner, "POST", "/invites/join", {"code": code["code"].lower()}, 200)
    return kitchen["id"]


def meal_body(kitchen_id, **overrides):
    body = {
        "group_id": kitchen_id,
        "meal_date": D(),
        "meal_slot": "D",
        "title": "Rajma chawal",
        "sides": ["Salad"],
        "chef_type": "MEMBER",
        "attendees": [],
        "guest_count": 0,
        "prep_tasks": [],
    }
    body.update(overrides)
    return body


# ─── Access and My Kitchen ─────────────────────────────────────────────────────────────


def test_needs_the_plate_feature(client):
    assert client.get("/api/v1/plate/kitchens", headers=H("alice")).status_code == 403


def test_my_kitchen_is_created_once_and_cannot_be_left(c):
    first = get(c, "alice", "/kitchens")
    again = get(c, "alice", "/kitchens")
    assert [k["id"] for k in first] == [k["id"] for k in again]
    mine = first[0]
    assert mine["is_personal"] and mine["name"] == "My Kitchen"
    assert get(c, "alice", "/me")["name"] == "Alice"
    send(c, "alice", "DELETE", f"/kitchens/{mine['id']}/members/me", status=422)
    send(c, "alice", "DELETE", f"/kitchens/{mine['id']}", status=422)
    send(c, "alice", "PUT", "/live/presence", {"kitchen_ids": [mine["id"]], "shopping": True}, 422)


def test_other_peoples_kitchens_are_hidden(c):
    kitchen = personal(c, "alice")["id"]
    send(c, "bob", "POST", "/meals", meal_body(kitchen), 404)
    assert get(c, "bob", "/meals", **{"from": D(), "to": D(6)}) == []


# ─── Sharing ───────────────────────────────────────────────────────────────────────────


def test_join_with_code_and_see_each_others_first_names(c):
    kitchen_id = shared_kitchen(c)
    kitchens = {k["id"]: k for k in get(c, "bob", "/kitchens")}
    assert len(kitchens[kitchen_id]["members"]) == 2
    names = {p["name"] for p in get(c, "bob", "/people")}
    assert {"Alice", "Bob"} <= names
    assert "email" not in get(c, "bob", "/people")[0]
    send(c, "carol", "POST", "/invites/join", {"code": "NOPE1234"}, 404)


def test_invites_go_to_known_people_only(c):
    shared_kitchen(c)  # alice and bob now know each other
    second = send(
        c, "alice", "POST", "/kitchens", {"name": "Flat", "group_type": "flatmates"}, 201
    ).json()
    bob, carol = me(c, "bob"), me(c, "carol")
    send(c, "alice", "POST", f"/kitchens/{second['id']}/invites", {"user_ids": [carol]}, 422)
    out = send(c, "alice", "POST", f"/kitchens/{second['id']}/invites", {"user_ids": [bob]}, 200)
    assert out.json()["invited"] == [bob]

    invites = get(c, "bob", "/invites")
    assert invites[0]["kitchen_name"] == "Flat"
    send(c, "bob", "POST", f"/invites/{invites[0]['id']}/accept", status=200)
    assert get(c, "bob", "/invites") == []
    assert second["id"] in {k["id"] for k in get(c, "bob", "/kitchens")}


def test_leaving_passes_ownership_and_clears_default(c):
    kitchen_id = shared_kitchen(c)
    send(c, "alice", "PATCH", "/settings", {"default_group_id": kitchen_id}, 200)
    send(c, "alice", "DELETE", f"/kitchens/{kitchen_id}/members/me", status=204)
    assert get(c, "alice", "/settings")["default_group_id"] is None
    kitchen = next(k for k in get(c, "bob", "/kitchens") if k["id"] == kitchen_id)
    assert kitchen["owner_id"] == me(c, "bob")
    # The last member leaving removes the kitchen.
    send(c, "bob", "DELETE", f"/kitchens/{kitchen_id}/members/me", status=204)
    assert kitchen_id not in {k["id"] for k in get(c, "bob", "/kitchens")}


def test_only_the_owner_deletes_a_kitchen(c):
    kitchen_id = shared_kitchen(c)
    send(c, "alice", "POST", "/meals", meal_body(kitchen_id, attendees=[me(c, "alice")]), 201)
    send(c, "bob", "DELETE", f"/kitchens/{kitchen_id}", status=403)
    send(c, "alice", "DELETE", f"/kitchens/{kitchen_id}", status=204)
    assert get(c, "bob", "/meals", **{"from": D(-7), "to": D(7)}) == []


# ─── Meals ─────────────────────────────────────────────────────────────────────────────


def test_shared_meal_attendees_prep_and_synced_ticks(c):
    kitchen_id = shared_kitchen(c)
    alice, bob = me(c, "alice"), me(c, "bob")
    meal = send(
        c,
        "alice",
        "POST",
        "/meals",
        meal_body(
            kitchen_id,
            meal_date=D(1),
            chef_type="TOGETHER",
            attendees=[alice, bob, me(c, "carol")],  # carol isn't a member: dropped
            prep_tasks=[{"title": "Soak rajma"}, {"title": "  "}],
        ),
        201,
    ).json()
    assert set(meal["attendees"]) == {alice, bob}
    assert [t["title"] for t in meal["prep_tasks"]] == ["Soak rajma"]

    task = meal["prep_tasks"][0]["id"]
    ticked = send(c, "bob", "PATCH", f"/prep-tasks/{task}", {"done": True}, 200).json()
    assert ticked["prep_tasks"][0]["done_by"] == bob

    # Editing keeps the tick on a task that stays.
    edited = send(
        c,
        "alice",
        "PUT",
        f"/meals/{meal['id']}",
        meal_body(
            kitchen_id,
            meal_date=D(1),
            chef_type="TOGETHER",
            attendees=[alice, bob],
            prep_tasks=[{"id": task, "title": "Soak rajma overnight"}, {"title": "Chop onions"}],
        ),
        200,
    ).json()
    assert edited["prep_tasks"][0]["done_by"] == bob
    assert edited["prep_tasks"][0]["title"] == "Soak rajma overnight"

    reacted = send(c, "bob", "PUT", f"/meals/{meal['id']}/reaction", {"reaction": "heart"}, 200)
    assert reacted.json()["reactions"] == {bob: "heart"}


def test_personal_meals_are_just_me(c):
    kitchen = personal(c, "alice")["id"]
    meal = send(c, "alice", "POST", "/meals", meal_body(kitchen, attendees=[]), 201).json()
    assert meal["attendees"] == [me(c, "alice")]
    send(c, "alice", "POST", "/meals", meal_body(kitchen, chef_type="TOGETHER"), 422)
    send(c, "alice", "PUT", f"/meals/{meal['id']}/reaction", {"reaction": "up"}, 422)
    send(c, "alice", "POST", "/meals", meal_body(kitchen, title="  "), 422)


def test_leftovers_land_in_the_next_slot_with_no_prep(c):
    kitchen = personal(c, "alice")["id"]
    dinner = send(
        c,
        "alice",
        "POST",
        "/meals",
        meal_body(kitchen, title="Paneer butter masala", prep_tasks=[{"title": "Marinate"}]),
        201,
    ).json()
    send(c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=D(1), meal_slot="B"), 201)
    left = send(c, "alice", "POST", f"/meals/{dinner['id']}/leftovers", status=201).json()
    assert (left["meal_date"], left["meal_slot"]) == (D(1), "L")
    assert left["title"] == "Paneer butter masala (leftovers)"
    assert left["leftover_of"] == dinner["id"] and left["prep_tasks"] == []

    # Deleting the original keeps the leftovers, unlinked.
    send(c, "alice", "DELETE", f"/meals/{dinner['id']}", status=204)
    remaining = get(c, "alice", "/meals", **{"from": D(), "to": D(3)})
    assert [m["leftover_of"] for m in remaining if m["id"] == left["id"]] == [None]


def test_copy_week_fills_empty_slots_only(c):
    kitchen = personal(c, "alice")["id"]
    monday = TODAY - timedelta(days=TODAY.weekday())
    last = monday - timedelta(days=7)
    for offset, slot, title in [(0, "B", "Poha"), (0, "D", "Dal"), (2, "L", "Wrap")]:
        body = meal_body(kitchen, meal_date=(last + timedelta(days=offset)).isoformat())
        send(c, "alice", "POST", "/meals", {**body, "meal_slot": slot, "title": title}, 201)
    send(c, "alice", "POST", "/meals", meal_body(kitchen, meal_date=monday.isoformat()), 201)

    copied = send(
        c,
        "alice",
        "POST",
        "/meals/copy-week",
        {
            "from_group_id": kitchen,
            "to_group_id": kitchen,
            "from_week": last.isoformat(),
            "to_week": monday.isoformat(),
        },
        200,
    ).json()
    assert copied == {"copied": 2}
    week = get(c, "alice", "/meals", **{"from": monday.isoformat(), "to": D(6)})
    assert sorted((m["meal_slot"], m["title"]) for m in week if m["meal_date"] == monday.isoformat()) == [
        ("B", "Poha"),
        ("D", "Rajma chawal"),
    ]


def test_meal_ranges_are_bounded(c):
    send(c, "alice", "GET", "/meals?from=2026-01-01&to=2026-06-01", status=422)


# ─── Cart ──────────────────────────────────────────────────────────────────────────────


def test_cart_guesses_aisles_links_meals_and_clears_the_basket(c):
    kitchen_id = shared_kitchen(c)
    meal = send(c, "alice", "POST", "/meals", meal_body(kitchen_id, attendees=[me(c, "alice")]), 201)
    paneer = send(
        c,
        "alice",
        "POST",
        "/grocery-items",
        {"group_id": kitchen_id, "name": "Paneer (400g)", "meal_plan_id": meal.json()["id"]},
        201,
    ).json()
    peas = send(
        c, "bob", "POST", "/grocery-items", {"group_id": kitchen_id, "name": "Frozen peas"}, 201
    ).json()
    assert (paneer["aisle"], peas["aisle"]) == ("Dairy & Eggs", "Frozen")
    assert paneer["meal_plan_id"] == meal.json()["id"]

    checked = send(c, "bob", "PATCH", f"/grocery-items/{paneer['id']}", {"checked": True}, 200)
    assert checked.json()["checked_by"] == me(c, "bob")
    send(c, "alice", "POST", "/grocery-items/clear-checked", {"group_ids": [kitchen_id]}, 204)
    assert [i["name"] for i in get(c, "alice", "/grocery-items")] == ["Frozen peas"]

    # A meal from another kitchen can't be linked.
    other = personal(c, "alice")["id"]
    body = {"group_id": other, "name": "Milk", "meal_plan_id": meal.json()["id"]}
    send(c, "alice", "POST", "/grocery-items", body, 422)


def test_deleting_a_meal_unlinks_its_cart_items(c):
    kitchen = personal(c, "alice")["id"]
    meal = send(c, "alice", "POST", "/meals", meal_body(kitchen), 201).json()
    body = {"group_id": kitchen, "name": "Rajma", "meal_plan_id": meal["id"]}
    item = send(c, "alice", "POST", "/grocery-items", body, 201).json()
    send(c, "alice", "DELETE", f"/meals/{meal['id']}", status=204)
    assert get(c, "alice", "/grocery-items")[0]["meal_plan_id"] is None
    assert get(c, "alice", "/grocery-items")[0]["id"] == item["id"]


# ─── Presence and activity ─────────────────────────────────────────────────────────────


def test_going_live_shows_on_the_kitchen_and_lapses(c):
    kitchen_id = shared_kitchen(c)
    alice = me(c, "alice")
    out = send(c, "alice", "PUT", "/live/presence", {"kitchen_ids": [kitchen_id], "shopping": True}, 200)
    assert out.json()[0]["shopping_now"] == [alice]
    seen_by_bob = next(k for k in get(c, "bob", "/kitchens") if k["id"] == kitchen_id)
    assert seen_by_bob["shopping_now"] == [alice] and alice in seen_by_bob["shopping_since"]

    # Presence older than an hour no longer counts.
    with c.session_factory() as db:
        row = db.query(PlateKitchenMember).filter_by(kitchen_id=__import__("uuid").UUID(kitchen_id)).filter(
            PlateKitchenMember.shopping_since.is_not(None)
        ).one()
        row.shopping_since = datetime.now(timezone.utc) - timedelta(hours=2)
        db.commit()
    assert next(k for k in get(c, "bob", "/kitchens") if k["id"] == kitchen_id)["shopping_now"] == []

    send(c, "alice", "PUT", "/live/presence", {"kitchen_ids": [kitchen_id], "shopping": False}, 200)


def test_new_activity_until_seen(c):
    kitchen_id = shared_kitchen(c)
    send(c, "alice", "POST", f"/kitchens/{kitchen_id}/seen", status=204)
    send(c, "bob", "POST", "/ideas", {"group_id": kitchen_id, "title": "Malai kofta"}, 201)
    kitchen = lambda user: next(k for k in get(c, user, "/kitchens") if k["id"] == kitchen_id)  # noqa: E731
    assert kitchen("alice")["has_new_activity"] is True
    assert kitchen("bob")["has_new_activity"] is False
    send(c, "alice", "POST", f"/kitchens/{kitchen_id}/seen", status=204)
    assert kitchen("alice")["has_new_activity"] is False


# ─── Ideas and settings ────────────────────────────────────────────────────────────────


def test_ideas_vote_in_shared_kitchens_only(c):
    kitchen_id = shared_kitchen(c)
    idea = send(c, "alice", "POST", "/ideas", {"group_id": kitchen_id, "title": "Pasta"}, 201)
    assert idea.json()["votes"] == [me(c, "alice")]
    voted = send(c, "bob", "PUT", f"/ideas/{idea.json()['id']}/vote", {"voted": True}, 200)
    assert len(voted.json()["votes"]) == 2
    send(c, "bob", "DELETE", f"/ideas/{idea.json()['id']}", status=403)
    send(c, "alice", "DELETE", f"/ideas/{idea.json()['id']}", status=204)

    wish = send(c, "alice", "POST", "/ideas", {"group_id": personal(c, "alice")["id"], "title": "Shakshuka"}, 201)
    assert wish.json()["votes"] == []
    send(c, "alice", "PUT", f"/ideas/{wish.json()['id']}/vote", {"voted": True}, 422)


def test_settings_default_kitchen_and_reminder_window(c):
    assert get(c, "alice", "/settings") == {
        "default_group_id": None,
        "reminder_enabled": True,
        "reminder_time": "20:00",
    }
    kitchen = personal(c, "alice")["id"]
    send(c, "alice", "PATCH", "/settings", {"default_group_id": kitchen, "reminder_time": "21:30"}, 200)
    send(c, "alice", "PATCH", "/settings", {"reminder_enabled": False}, 200)
    assert get(c, "alice", "/settings") == {
        "default_group_id": kitchen,
        "reminder_enabled": False,
        "reminder_time": "21:30",
    }
    send(c, "alice", "PATCH", "/settings", {"default_group_id": None}, 200)
    assert get(c, "alice", "/settings")["default_group_id"] is None
    send(c, "alice", "PATCH", "/settings", {"reminder_time": "23:00"}, 422)
    send(c, "bob", "PATCH", "/settings", {"default_group_id": kitchen}, 404)


# ─── Recipe import ─────────────────────────────────────────────────────────────────────

PAGE = """<html><head><script type="application/ld+json">
{"@context": "https://schema.org", "@graph": [{"@type": "WebPage"},
 {"@type": ["Recipe"], "name": "Rajma Masala",
  "recipeIngredient": ["1 cup <b>rajma</b>", "2 onions", " "]}]}
</script></head></html>"""


def test_recipe_import_reads_schema_org(c, monkeypatch):
    monkeypatch.setattr(plate_recipes, "fetch_page", lambda url: PAGE)
    out = send(c, "alice", "POST", "/recipes/import", {"url": "https://site.com/r/rajma"}, 200)
    assert out.json() == {"title": "Rajma Masala", "ingredients": ["1 cup rajma", "2 onions"]}


def test_recipe_import_falls_back_to_the_link_name(c, monkeypatch):
    def fail(url):
        raise plate_recipes.RecipeImportError("down")

    monkeypatch.setattr(plate_recipes, "fetch_page", fail)
    out = send(c, "alice", "POST", "/recipes/import", {"url": "https://x.com/paneer-tikka-12"}, 200)
    assert out.json() == {"title": "Paneer tikka", "ingredients": []}
    send(c, "alice", "POST", "/recipes/import", {"url": "not a link at all"}, 422)


def test_recipe_fetch_refuses_private_addresses():
    for url in ("http://127.0.0.1/admin", "http://localhost:8000/", "http://10.0.0.5/x"):
        with pytest.raises(plate_recipes.RecipeImportError):
            plate_recipes.fetch_page(url)
