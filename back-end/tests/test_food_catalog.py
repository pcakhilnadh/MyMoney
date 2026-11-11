import csv
from pathlib import Path

from sqlalchemy import insert, text

from app.models import Profile
from app.food_search import catalog, fuzzy_score
from tests.conftest import H


def test_search_catalog_is_shared_and_matches_names_and_aliases(client):
    client.get("/api/auth/me", headers=H("alice"))
    client.get("/api/auth/me", headers=H("bob"))
    with client.session_factory() as db:
        alice = db.query(Profile).filter_by(email="alice@gmail.com").one()
        bob = db.query(Profile).filter_by(email="bob@gmail.com").one()
        db.execute(text(
            "CREATE TABLE food_catalog_master "
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
            "(id text PRIMARY KEY, base_food_name text NOT NULL, aliases text, user_id uuid)"
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
