import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth
from app.auth import GoogleIdentity
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def client(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine)

    def override_db():
        with Session() as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    # token string == user handle, e.g. "Bearer alice" -> alice@gmail.com
    monkeypatch.setattr(
        auth,
        "verify_google_token",
        lambda t: GoogleIdentity(sub="sub-" + t, email=f"{t}@gmail.com", name=t.title()),
    )
    c = TestClient(app)
    c.session_factory = Session
    yield c
    app.dependency_overrides.clear()


def H(user: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user}"}
