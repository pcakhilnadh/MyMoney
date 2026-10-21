"""Test-only API server for browser e2e: SQLite DB and fake Google token verification.
Run from back-end/:  uv run python -m tests.e2e_server
Never used in production."""

import base64
import json
import os

os.environ["DATABASE_URL"] = "sqlite:///./e2e.db"
os.environ["CORS_ORIGINS"] = '["http://localhost:5174"]'
if os.path.exists("e2e.db"):
    os.remove("e2e.db")

import uvicorn  # noqa: E402

from app import auth  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


def fake_verify(token: str) -> auth.GoogleIdentity:
    payload = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return auth.GoogleIdentity(sub=claims["sub"], email=claims["email"], name=claims.get("name"))


auth.verify_google_token = fake_verify
Base.metadata.create_all(engine)

if __name__ == "__main__":
    uvicorn.run(app, port=8001)
