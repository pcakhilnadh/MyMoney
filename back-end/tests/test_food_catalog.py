import csv
from pathlib import Path

from sqlalchemy import insert, select, text

from app.models import Profile
from app.food_search import catalog, fuzzy_score
from app.routers_food import FoodCategory, FoodType
from tests.conftest import H


def create_writable_catalog(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master ("
            "id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, description text, "
            "category text, food_type text, calories_100g numeric, protein_100g numeric, "
            "carbs_100g numeric, fat_100g numeric, fiber_100g numeric, image_data text, user_id uuid)"
        ))
        db.commit()


def test_create_catalog_item_and_search_as_another_user(client):
    create_writable_catalog(client)
    body = {
        "base_food_name": "  Rice puttu  ", "aliases": "Ari puttu",
        "description": "Steamed rice dish", "category": "base_food", "food_type": "processed",
        "calories_100g": 81.5, "protein_100g": 1.2, "carbs_100g": 11.8,
        "fat_100g": 3.1, "fiber_100g": 0.0,
    }
    response = client.post("/api/food/catalog", json=body, headers=H("alice"))
    assert response.status_code == 201
    result = response.json()
    assert result["base_food_name"] == "Rice puttu"
    for key in body.keys() - {"base_food_name"}:
        assert result[key] == body[key]
    with client.session_factory() as db:
        alice = db.query(Profile).filter_by(email="alice@gmail.com").one()
        stored = db.execute(select(catalog).where(catalog.c.id == result["id"])).one()
        assert result["user_id"] == str(alice.id)
        assert stored.user_id == alice.id
        assert stored.base_food_name == "Rice puttu"
        for key in ("aliases", "description", "category", "food_type"):
            assert getattr(stored, key) == body[key]
        for key in ("calories_100g", "protein_100g", "carbs_100g", "fat_100g", "fiber_100g"):
            assert float(getattr(stored, key)) == body[key]
    assert client.get("/api/food/catalog", params={"q": "putt"}, headers=H("bob")).json() == [
        {
            "id": result["id"], "name": "Rice puttu", "score": 1.0,
            "calories_100g": 81.5, "protein_100g": 1.2, "carbs_100g": 11.8, "fat_100g": 3.1,
        },
    ]
    assert client.get("/api/food/catalog", params={"q": "ari"}, headers=H("bob")).json() == [
        {
            "id": result["id"], "name": "Rice puttu", "score": 0.9,
            "calories_100g": 81.5, "protein_100g": 1.2, "carbs_100g": 11.8, "fat_100g": 3.1,
        },
    ]


def test_create_catalog_item_requires_name_category_and_food_type(client):
    create_writable_catalog(client)
    url = "/api/food/catalog"
    assert client.post(url, json={"base_food_name": "Food"}).status_code == 401
    valid = {"base_food_name": "Food", "category": "fruit", "food_type": "raw"}
    for body in (
        {}, {"base_food_name": ""}, {"base_food_name": "   "},
        {"base_food_name": "Food"},
        {"base_food_name": "Food", "category": "fruit"},
        {"base_food_name": "Food", "food_type": "raw"},
        {**valid, "base_food_name": ""},
        {**valid, "base_food_name": "   "},
        {**valid, "base_food_name": "x" * 101},
        {**valid, "category": None},
        {**valid, "food_type": None},
        {**valid, "user_id": "00000000-0000-0000-0000-000000000001"},
        {**valid, "id": "chosen"},
        {**valid, "protein_100g": -1},
        {**valid, "calories_100g": "NaN"},
        {**valid, "fat_100g": "Infinity"},
        {**valid, "category": "unknown"},
        {**valid, "food_type": "cooked"},
    ):
        assert client.post(url, json=body, headers=H("alice")).status_code == 422
    response = client.post(url, json=valid, headers=H("alice"))
    assert response.status_code == 201
    data = response.json()
    assert data["base_food_name"] == "Food"
    assert all(data[key] is None for key in (
        "aliases", "description", "calories_100g",
        "protein_100g", "carbs_100g", "fat_100g", "fiber_100g",
    ))


def test_catalog_enums_match_dataset_and_accept_all_values(client):
    dataset = Path(__file__).resolve().parents[1] / "food_dataset_prep" / "food_catelog_master.csv"
    with dataset.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    assert {row["category"] for row in rows} == {category.value for category in FoodCategory}
    assert {row["food_type"] for row in rows} == {food_type.value for food_type in FoodType}

    create_writable_catalog(client)
    for category in FoodCategory:
        for food_type in FoodType:
            response = client.post(
                "/api/food/catalog",
                json={"base_food_name": "Food", "category": category.value, "food_type": food_type.value},
                headers=H("alice"),
            )
            assert response.status_code == 201
            assert response.json()["category"] == category.value
            assert response.json()["food_type"] == food_type.value
            with client.session_factory() as db:
                row = db.execute(select(catalog).where(catalog.c.id == response.json()["id"])).one()
                assert row.category == category.value
                assert row.food_type == food_type.value


def test_search_catalog_is_shared_and_matches_names_and_aliases(client):
    client.get("/api/auth/me", headers=H("alice"))
    client.get("/api/auth/me", headers=H("bob"))
    with client.session_factory() as db:
        alice = db.query(Profile).filter_by(email="alice@gmail.com").one()
        bob = db.query(Profile).filter_by(email="bob@gmail.com").one()
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.execute(insert(catalog), [
            {"id": "one", "base_food_name": "Egg", "aliases": "Anda", "user_id": None},
            {"id": "two", "base_food_name": "Egg curry", "aliases": None, "user_id": alice.id},
            {"id": "three", "base_food_name": "Egg omelette", "aliases": None, "user_id": bob.id},
            {"id": "four", "base_food_name": "100% juice", "aliases": None, "user_id": None},
        ])
        db.commit()

    assert client.get("/api/food/catalog", params={"q": "egg"}).status_code == 401
    response = client.get("/api/food/catalog", params={"q": " eGG "}, headers=H("alice"))
    assert response.status_code == 200
    assert response.json() == [
        {"id": "one", "name": "Egg", "score": 1.0},
        {"id": "two", "name": "Egg curry", "score": 1.0},
        {"id": "three", "name": "Egg omelette", "score": 1.0},
    ]
    assert client.get("/api/food/catalog", params={"q": "egg"}, headers=H("bob")).json() == response.json()
    assert client.get("/api/food/catalog", params={"q": "ANDA"}, headers=H("alice")).json() == [
        {"id": "one", "name": "Egg", "score": 0.9}
    ]
    assert client.get("/api/food/catalog", params={"q": "%"}, headers=H("alice")).json() == [
        {"id": "four", "name": "100% juice", "score": 1.0}
    ]
    assert client.get("/api/food/catalog", params={"q": "   "}, headers=H("alice")).json() == []
    assert client.get("/api/food/catalog", params={"q": ""}, headers=H("alice")).status_code == 422


def test_hybrid_search_on_catalogue_spellings_and_ranking(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        dataset = Path(__file__).resolve().parents[1] / "food_dataset_prep" / "food_catelog_master.csv"
        with dataset.open(encoding="utf-8", newline="") as file:
            rows = [
                {"id": row["id"], "base_food_name": row["base_food_name"],
                 "aliases": row["aliases"] or None, "user_id": None}
                for row in csv.DictReader(file)
            ]
        rows.append({"id": "test-exact", "base_food_name": "Chapathi test",
                     "aliases": None, "user_id": None})
        db.execute(insert(catalog), rows)
        db.commit()

    response = client.get("/api/food/catalog", params={"q": "chapathi"}, headers=H("alice"))
    assert response.status_code == 200
    results = response.json()
    assert results == [{"id": "test-exact", "name": "Chapathi test", "score": 1.0}]
    assert len(results) <= 10
    assert len({result["id"] for result in results}) == len(results)
    assert client.get("/api/food/catalog", params={"q": "chapati"}, headers=H("bob")).json()[0] == {
        "id": "indb-ASC096", "name": "Chapati/Roti", "score": 1.0
    }


def test_fuzzy_search_matches_aliases_and_is_bounded(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        rows = [
            {"id": str(i), "base_food_name": f"Chapati {i:02}", "aliases": None, "user_id": None}
            for i in range(55)
        ]
        rows.append({"id": "alias", "base_food_name": "Rice flakes", "aliases": "Beaten rice",
                     "user_id": None})
        db.execute(insert(catalog), rows)
        db.commit()
    fuzzy = client.get("/api/food/catalog", params={"q": "chapathi"}, headers=H("alice")).json()
    assert len(fuzzy) == 10
    assert all(item["score"] == fuzzy_score("chapathi", item["name"], None) for item in fuzzy)
    alias = client.get("/api/food/catalog", params={"q": "beatan rice"}, headers=H("alice")).json()
    assert alias == [{
        "id": "alias", "name": "Rice flakes",
        "score": fuzzy_score("beatan rice", "Rice flakes", "Beaten rice"),
    }]
    exact = client.get("/api/food/catalog", params={"q": "chapati"}, headers=H("alice")).json()
    assert len(exact) == 10
    assert all("chapati" in item["name"].lower() for item in exact)


def test_fuzzy_threshold_includes_boundary_and_excludes_lower_scores(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.execute(insert(catalog), [
            {"id": "boundary", "base_food_name": "abcdefghiX", "aliases": None, "user_id": None},
            {"id": "below", "base_food_name": "abcdefghXY", "aliases": None, "user_id": None},
        ])
        db.commit()
    assert fuzzy_score("abcdefghij", "abcdefghiX", None) == 0.9
    assert client.get("/api/food/catalog", params={"q": "abcdefghij"}, headers=H("alice")).json() == [
        {"id": "boundary", "name": "abcdefghiX", "score": 0.9},
    ]


def test_fuzzy_results_return_similarity_scores_in_descending_order(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.execute(insert(catalog), [
            {"id": "lower", "base_food_name": "abcdefghijklmnopqrXY", "aliases": None, "user_id": None},
            {"id": "higher", "base_food_name": "abcdefghijklmnopqrsX", "aliases": None, "user_id": None},
        ])
        db.commit()

    response = client.get("/api/food/catalog", params={"q": "abcdefghijklmnopqrst"}, headers=H("alice"))
    assert response.json() == [
        {"id": "higher", "name": "abcdefghijklmnopqrsX", "score": 0.95},
        {"id": "lower", "name": "abcdefghijklmnopqrXY", "score": 0.9},
    ]


def test_equal_scores_are_ordered_by_name_before_limiting(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        names = [
            "zebra", "apple", "Banana", "cherry", "Date", "elderberry",
            "Fig", "grape", "Honeydew", "kiwi", "Lemon", "mango",
        ]
        db.execute(insert(catalog), [
            {"id": str(i), "base_food_name": name, "aliases": "test matching", "user_id": None}
            for i, name in enumerate(names)
        ])
        db.commit()

    expected_names = sorted(names, key=str.lower)[:10]
    exact = client.get("/api/food/catalog", params={"q": "test matching"}, headers=H("alice"))
    assert [item["name"] for item in exact.json()] == expected_names
    assert all(item["score"] == 0.9 for item in exact.json())

    fuzzy = client.get("/api/food/catalog", params={"q": "test matchinx"}, headers=H("alice"))
    assert [item["name"] for item in fuzzy.json()] == expected_names
    assert all(item["score"] == 12 / 13 for item in fuzzy.json())


def test_name_matches_rank_above_alias_matches_before_limit(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        rows = [
            {"id": f"alias-{i}", "base_food_name": f"Alpha {i:02}", "aliases": "putt",
             "user_id": None}
            for i in range(12)
        ]
        rows.extend([
            {"id": "name-only", "base_food_name": "Rice puttu", "aliases": None, "user_id": None},
            {"id": "both", "base_food_name": "Z puttu", "aliases": "putt", "user_id": None},
        ])
        db.execute(insert(catalog), rows)
        db.commit()

    response = client.get("/api/food/catalog", params={"q": "PuTt"}, headers=H("alice"))
    assert response.status_code == 200
    assert response.json() == [
        {"id": "name-only", "name": "Rice puttu", "score": 1.0},
        {"id": "both", "name": "Z puttu", "score": 1.0},
        *[
            {"id": f"alias-{i}", "name": f"Alpha {i:02}", "score": 0.9}
            for i in range(8)
        ],
    ]


def test_batch_search_matches_single_search_and_preserves_input_order(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.execute(insert(catalog), [
            {"id": "puttu", "base_food_name": "Rice puttu", "aliases": "Ari puttu", "user_id": None},
            {"id": "alias", "base_food_name": "Mushroom", "aliases": "Putta Godugu", "user_id": None},
            {"id": "egg", "base_food_name": "Egg", "aliases": "Anda", "user_id": None},
            {"id": "fuzzy", "base_food_name": "Rice flakes", "aliases": "Beaten rice", "user_id": None},
        ])
        db.commit()

    queries = [" putt ", "beatan rice", "missing food", "putt", "   ", "egg", "putt"]
    response = client.post(
        "/api/food/catalog/search-batch", json={"queries": queries}, headers=H("alice"),
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert [item["query"] for item in results] == queries
    for query, item in zip(queries, results):
        single = client.get("/api/food/catalog", params={"q": query}, headers=H("alice"))
        assert item["matches"] == single.json()
    assert results[0]["matches"] == [
        {"id": "puttu", "name": "Rice puttu", "score": 1.0},
        {"id": "alias", "name": "Mushroom", "score": 0.9},
    ]
    assert results[1]["matches"] == [{
        "id": "fuzzy", "name": "Rice flakes",
        "score": fuzzy_score("beatan rice", "Rice flakes", "Beaten rice"),
    }]
    assert results[2]["matches"] == []
    assert results[4]["matches"] == []


def test_batch_search_validates_request_and_requires_authentication(client):
    url = "/api/food/catalog/search-batch"
    assert client.post(url, json={"queries": ["egg"]}).status_code == 401
    for body in (
        {},
        {"queries": []},
        {"queries": ["egg"] * 11},
        {"queries": [""]},
        {"queries": ["x" * 101]},
        {"queries": ["egg", 123]},
    ):
        assert client.post(url, json=body, headers=H("alice")).status_code == 422

    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.commit()
    response = client.post(url, json={"queries": ["x" * 100] * 10}, headers=H("alice"))
    assert response.status_code == 200
    assert len(response.json()["results"]) == 10


def test_batch_search_limits_each_query_independently(client):
    with client.session_factory() as db:
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, calories_100g numeric, protein_100g numeric, carbs_100g numeric, fat_100g numeric, user_id uuid)"
        ))
        db.execute(insert(catalog), [
            {"id": f"{food}-{i}", "base_food_name": f"{food} {i:02}",
             "aliases": None, "user_id": None}
            for food in ("Apple", "Banana") for i in range(12)
        ])
        db.commit()
    response = client.post(
        "/api/food/catalog/search-batch",
        json={"queries": ["apple", "banana"]},
        headers=H("alice"),
    )
    assert response.status_code == 200
    results = response.json()["results"]
    for food, item in zip(("Apple", "Banana"), results):
        assert item["matches"] == [
            {"id": f"{food}-{i}", "name": f"{food} {i:02}", "score": 1.0}
            for i in range(10)
        ]
