"""The app version is written in several files; they must all say the same thing.

Bump them together (see the Changelog in README.md). This fails if one is missed.
"""

import json
import re
import tomllib
from pathlib import Path

import pytest

from app import main

ROOT = Path(__file__).resolve().parents[2]
BACK = ROOT / "back-end"
FRONT = ROOT / "front-end"


def _versions() -> dict[str, str]:
    found = {
        "back-end/app/main.py": main.__version__,
        "back-end/pyproject.toml": tomllib.loads((BACK / "pyproject.toml").read_text("utf-8"))[
            "project"
        ]["version"],
    }
    lock = tomllib.loads((BACK / "uv.lock").read_text("utf-8"))
    found["back-end/uv.lock"] = next(p["version"] for p in lock["package"] if p["name"] == "back-end")

    package = json.loads((FRONT / "package.json").read_text("utf-8"))
    found["front-end/package.json"] = package["version"]
    package_lock = json.loads((FRONT / "package-lock.json").read_text("utf-8"))
    found["front-end/package-lock.json"] = package_lock["version"]
    found["front-end/package-lock.json (root package)"] = package_lock["packages"][""]["version"]

    readme = (ROOT / "README.md").read_text("utf-8")
    match = re.search(r"^Version \*\*(\S+)\*\*", readme, re.MULTILINE)
    found["README.md (Version line)"] = match.group(1) if match else "missing"
    changelog = re.search(r"^## Changelog\s+### (\d+\.\d+\.\d+)", readme, re.MULTILINE)
    found["README.md (latest changelog entry)"] = changelog.group(1) if changelog else "missing"
    return found


@pytest.mark.skipif(not (FRONT / "package.json").exists(), reason="front-end not checked out")
def test_every_version_matches_the_server_version():
    versions = _versions()
    expected = main.__version__
    wrong = {where: v for where, v in versions.items() if v != expected}
    assert not wrong, f"expected {expected} everywhere, but found {wrong}"
