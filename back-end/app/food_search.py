import re
from collections.abc import Iterator
from difflib import SequenceMatcher
from heapq import nsmallest

from sqlalchemy import Text, Uuid, column, or_, select, table
from sqlalchemy.orm import Session

catalog = table(
    "food_catalog_master",
    column("id", Text),
    column("base_food_name", Text),
    column("aliases", Text),
    column("user_id", Uuid),
)

RESULT_LIMIT = 50
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


def hybrid_food_search(db: Session, query: str) -> list[tuple[str, str]]:
    exact = db.execute(
        select(catalog.c.id, catalog.c.base_food_name)
        .where(
            or_(
                catalog.c.base_food_name.icontains(query, autoescape=True),
                catalog.c.aliases.icontains(query, autoescape=True),
            )
        )
        .order_by(catalog.c.base_food_name, catalog.c.id)
        .limit(RESULT_LIMIT)
    ).all()
    results = [(row.id, row.base_food_name) for row in exact]
    query_length = sum(len(word) for word in re.findall(r"\w+", query))
    if len(results) == RESULT_LIMIT or query_length < MIN_FUZZY_LENGTH:
        return results

    exact_ids = {row.id for row in exact}

    def fuzzy_matches() -> Iterator[tuple[float, str, str]]:
        rows = db.execute(
            select(catalog.c.id, catalog.c.base_food_name, catalog.c.aliases)
            .execution_options(yield_per=500)
        )
        for row in rows:
            if row.id in exact_ids:
                continue
            score = fuzzy_score(query, row.base_food_name, row.aliases)
            if score >= FUZZY_THRESHOLD:
                yield (-score, row.base_food_name, row.id)

    # TODO: Combine vector similarity with these lexical results when embeddings are available.
    fuzzy = nsmallest(RESULT_LIMIT - len(results), fuzzy_matches())
    return results + [(food_id, name) for _, name, food_id in fuzzy]
