"""MyPlate helpers that don't touch the database: aisle guessing and recipe import."""

import html
import ipaddress
import json
import re
import socket
from urllib.parse import unquote, urljoin, urlparse

import requests

AISLES = (
    "Fresh Produce",
    "Dairy & Eggs",
    "Grains & Pulses",
    "Spices & Masala",
    "Bakery",
    "Meat & Fish",
    "Frozen",
    "Snacks & Drinks",
    "Household",
    "Other",
)

# Checked in order, so the more specific aisles win ("frozen peas", "peanut butter").
# Keep in step with guessAisle in the front end.
_AISLE_WORDS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (aisle, re.compile(pattern, re.I))
    for aisle, pattern in (
        ("Frozen", r"frozen|ice cream"),
        ("Household", r"soap|detergent|tissue|foil|cleaner|sponge|garbage bag"),
        ("Snacks & Drinks", r"peanut butter|chips|namkeen|juice|coffee|tea|soda|chocolate|biscuit"),
        ("Bakery", r"bread|pav|bun|naan|kulcha|cake"),
        ("Meat & Fish", r"chicken|mutton|fish|prawn|meat"),
        (
            "Spices & Masala",
            r"masala|jeera|cumin|turmeric|haldi|kasuri|pepper|salt|spice|hing|cardamom|clove|sauce",
        ),
        ("Dairy & Eggs", r"milk|curd|dahi|paneer|cheese|butter|ghee|cream|yogurt|egg"),
        (
            "Grains & Pulses",
            r"rice|atta|flour|dal|rajma|chana|oats|chia|poha|rava|sooji|lentil|moong|urad|pasta|noodle",
        ),
        (
            "Fresh Produce",
            r"onion|tomato|potato|spinach|palak|banana|apple|lemon|ginger|garlic|chilli|"
            r"coriander|carrot|fruit|veg|mint|cucumber|peas",
        ),
    )
)


def guess_aisle(name: str) -> str:
    return next((aisle for aisle, pattern in _AISLE_WORDS if pattern.search(name)), "Other")


def title_from_url(url: str) -> str | None:
    """`/recipes/paneer-butter-masala-123` → "Paneer butter masala"."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    slug = next((part for part in reversed(parsed.path.split("/")) if part), "")
    words = re.sub(r"\.[a-z]+$", "", unquote(slug), flags=re.I)
    words = re.sub(r"[-_]+", " ", words)
    words = re.sub(r"\d+", "", words).strip()
    words = re.sub(r"\s+", " ", words)
    return words[:1].upper() + words[1:].lower() if words else None


# ─── Recipe import ───────────────────────────────────────────────────────────────────────

MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 8
MAX_INGREDIENTS = 40


class RecipeImportError(ValueError):
    pass


def _public_host(host: str) -> bool:
    """Refuse hosts that resolve to private, loopback or link-local addresses (SSRF)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            return False
    return True


def fetch_page(url: str) -> str:
    """Fetch a public web page, following a few redirects, each re-checked."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise RecipeImportError("That link doesn't look like a web page.")
        if not _public_host(parsed.hostname):
            raise RecipeImportError("That link can't be opened.")
        response = requests.get(
            current,
            timeout=TIMEOUT_SECONDS,
            allow_redirects=False,
            stream=True,
            headers={"User-Agent": "MyPlate recipe import", "Accept": "text/html"},
        )
        if response.is_redirect and response.headers.get("location"):
            current = urljoin(current, response.headers["location"])
            response.close()
            continue
        if response.status_code >= 400:
            raise RecipeImportError("That page didn't load.")
        chunks, size = [], 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > MAX_PAGE_BYTES:
                break
            chunks.append(chunk)
        response.close()
        return b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
    raise RecipeImportError("That link redirects too many times.")


_LD_JSON = re.compile(
    r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.I | re.S
)
_TAG = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", text))).strip()


def _is_recipe(node: object) -> bool:
    if not isinstance(node, dict):
        return False
    kind = node.get("@type")
    return kind == "Recipe" or (isinstance(kind, list) and "Recipe" in kind)


def _find_recipe(data: object) -> dict | None:
    if _is_recipe(data):
        return data  # type: ignore[return-value]
    if isinstance(data, list):
        for item in data:
            if found := _find_recipe(item):
                return found
    if isinstance(data, dict) and "@graph" in data:
        return _find_recipe(data["@graph"])
    return None


def parse_recipe(page: str) -> tuple[str | None, list[str]]:
    """Name and ingredients from schema.org Recipe JSON-LD, which most recipe sites publish."""
    for block in _LD_JSON.findall(page):
        try:
            recipe = _find_recipe(json.loads(block.strip()))
        except ValueError:
            continue
        if recipe is None:
            continue
        name = _clean(str(recipe.get("name") or "")) or None
        raw = recipe.get("recipeIngredient") or recipe.get("ingredients") or []
        if isinstance(raw, str):
            raw = [raw]
        ingredients = [
            cleaned for item in raw if isinstance(item, str) and (cleaned := _clean(item))
        ]
        return name, ingredients[:MAX_INGREDIENTS]
    title = re.search(r"<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)", page, re.I)
    if title:
        return _clean(title.group(1)) or None, []
    return None, []


def import_recipe(url: str) -> dict:
    """Best effort: a page we can't read still gives a name from the link."""
    fallback = title_from_url(url)
    if fallback is None:
        raise RecipeImportError("That link doesn't look like a recipe page.")
    try:
        name, ingredients = parse_recipe(fetch_page(url))
    except (RecipeImportError, requests.RequestException):
        name, ingredients = None, []
    return {"title": (name or fallback)[:120], "ingredients": ingredients}
