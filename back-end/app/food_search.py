import re
from collections.abc import Iterator
from difflib import SequenceMatcher
from heapq import nsmallest

from sqlalchemy import Numeric, Text, Uuid, case, column, func, or_, select, table
from sqlalchemy.orm import Session

catalog = table(
    "food_catalog_master",
    column("id", Text),
    column("base_food_name", Text),
    column("aliases", Text),
    column("description", Text),
    column("category", Text),
    column("food_type", Text),
    column("calories_100g", Numeric),
    column("protein_100g", Numeric),
    column("carbs_100g", Numeric),
    column("fat_100g", Numeric),
    column("fiber_100g", Numeric),
    column("user_id", Uuid),
)

RESULT_LIMIT = 10
FUZZY_THRESHOLD = 0.9
MIN_FUZZY_LENGTH = 4


def fuzzy_score(query: str, name: str, aliases: str | None) -> float:
    words = re.findall(r"\w+", query.casefold())
    if not words or sum(len(word) for word in words) < MIN_FUZZY_LENGTH:
        return 0.0
    normalized_query = " ".join(words)
    candidates = []
    for text in (name, aliases or ""):
        for phrase in re.split(r"[,/;()]", text.casefold()):
            phrase_words = re.findall(r"\w+", phrase)
            if phrase_words:
                candidates.append(" ".join(phrase_words))
                if len(words) == 1:
                    candidates.extend(phrase_words)
    return max(
        (
            SequenceMatcher(None, normalized_query, candidate, autojunk=False).ratio()
            for candidate in candidates
        ),
        default=0.0,
    )


def hybrid_food_search(db: Session, query: str) -> list[tuple[str, str, float]]:
    name_matches = catalog.c.base_food_name.icontains(query, autoescape=True)
    substring_score = case((name_matches, 1.0), else_=0.9).label("score")
    exact = db.execute(
        select(catalog.c.id, catalog.c.base_food_name, substring_score)
        .where(
            or_(
                name_matches,
                catalog.c.aliases.icontains(query, autoescape=True),
            )
        )
        .order_by(
            substring_score.desc(), func.lower(catalog.c.base_food_name),
            catalog.c.base_food_name, catalog.c.id,
        )
        .limit(RESULT_LIMIT)
    ).all()
    results = [(row.id, row.base_food_name, row.score) for row in exact]
    if results:
        return results

    query_length = sum(len(word) for word in re.findall(r"\w+", query))
    if query_length < MIN_FUZZY_LENGTH:
        return []

    def fuzzy_matches() -> Iterator[tuple[float, str, str, str]]:
        rows = db.execute(
            select(catalog.c.id, catalog.c.base_food_name, catalog.c.aliases)
            .execution_options(yield_per=500)
        )
        for row in rows:
            score = fuzzy_score(query, row.base_food_name, row.aliases)
            if score >= FUZZY_THRESHOLD:
                yield (-score, row.base_food_name.lower(), row.base_food_name, row.id)

    # TODO: Put vector matches ahead of exact and fuzzy matches when embeddings are available.
    fuzzy = nsmallest(RESULT_LIMIT, fuzzy_matches())
    return [(food_id, name, -negative_score) for negative_score, _, name, food_id in fuzzy]
