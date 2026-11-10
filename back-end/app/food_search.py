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
    if results:
        return results

    query_length = sum(len(word) for word in re.findall(r"\w+", query))
    if query_length < MIN_FUZZY_LENGTH:
        return []

    def fuzzy_matches() -> Iterator[tuple[float, str, str]]:
        rows = db.execute(
            select(catalog.c.id, catalog.c.base_food_name, catalog.c.aliases)
            .execution_options(yield_per=500)
        )
        for row in rows:
            score = fuzzy_score(query, row.base_food_name, row.aliases)
            if score >= FUZZY_THRESHOLD:
                yield (-score, row.base_food_name, row.id)

    # TODO: Put vector matches ahead of exact and fuzzy matches when embeddings are available.
    fuzzy = nsmallest(RESULT_LIMIT, fuzzy_matches())
    return [(food_id, name) for _, name, food_id in fuzzy]
