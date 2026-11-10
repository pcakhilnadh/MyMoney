import csv
from pathlib import Path

from sqlalchemy import insert, text

from app.models import Profile
from app.food_search import catalog, fuzzy_score
from tests.conftest import H


def test_search_catalog_is_shared_and_matches_names_and_aliases(client):
    client.get("/auth/me", headers=H("alice"))
    client.get("/auth/me", headers=H("bob"))
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

    assert client.get("/food/catalog", params={"q": "egg"}).status_code == 401
    response = client.get("/api/food/catalog", params={"q": " eGG "}, headers=H("alice"))
    assert response.status_code == 200
    assert response.json() == [
        {"id": "one", "name": "Egg"},
        {"id": "two", "name": "Egg curry"},
        {"id": "three", "name": "Egg omelette"},
    ]
    assert client.get("/food/catalog", params={"q": "egg"}, headers=H("bob")).json() == response.json()
    assert client.get("/food/catalog", params={"q": "ANDA"}, headers=H("alice")).json() == [
        {"id": "one", "name": "Egg"}
    ]
    assert client.get("/food/catalog", params={"q": "%"}, headers=H("alice")).json() == [
        {"id": "four", "name": "100% juice"}
    ]
    assert client.get("/food/catalog", params={"q": "   "}, headers=H("alice")).json() == []
    assert client.get("/food/catalog", params={"q": ""}, headers=H("alice")).status_code == 422


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

    response = client.get("/food/catalog", params={"q": "chapathi"}, headers=H("alice"))
    assert response.status_code == 200
    results = response.json()
    assert results[0] == {"id": "test-exact", "name": "Chapathi test"}
    assert results == [{"id": "test-exact", "name": "Chapathi test"}]
    assert len(results) <= 10
    assert len({result["id"] for result in results}) == len(results)
    assert client.get("/food/catalog", params={"q": "chapati"}, headers=H("bob")).json()[0] == {
        "id": "indb-ASC096", "name": "Chapati/Roti"
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
    fuzzy = client.get("/food/catalog", params={"q": "chapathi"}, headers=H("alice")).json()
    assert len(fuzzy) == 10
    alias = client.get("/food/catalog", params={"q": "beatan rice"}, headers=H("alice")).json()
    assert {"id": "alias", "name": "Rice flakes"} in alias
    exact = client.get("/food/catalog", params={"q": "chapati"}, headers=H("alice")).json()
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
    assert client.get("/food/catalog", params={"q": "abcdefghij"}, headers=H("alice")).json() == [
        {"id": "boundary", "name": "abcdefghiX"},
    ]
