import time
from urllib.parse import urlsplit

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auth
from app.auth import (
    ACCESS_TOKEN_SECONDS,
    REFRESH_COOKIE,
    REFRESH_TOKEN_SECONDS,
    _cookie_secure,
    _new_token,
    _set_refresh_cookie,
    _session_response,
    _token_hash,
    create_session,
    get_current_user,
)
from app.config import settings
from app.db import get_db
from app.models import AuthSession, Profile

router = APIRouter(prefix="/auth", tags=["auth"])


def _verify_cookie_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin is None:
        return
    allowed_origins = {settings.app_url.rstrip("/")}
    allowed_origins.update(value.rstrip("/") for value in settings.cors_origins)
    if origin.rstrip("/") not in allowed_origins and urlsplit(origin).netloc != request.url.netloc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Request origin not allowed")


class GoogleCredential(BaseModel):
    credential: str


@router.post("/login")
def login(
    body: GoogleCredential,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    identity = auth.verify_google_token(body.credential)
    return create_session(identity, db, response, request)


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
) -> dict:
    _verify_cookie_origin(request)
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing refresh session")
    session = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == _token_hash(refresh_token))
    )
    now = int(time.time())
    if session is None or session.refresh_expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh session expired")

    access_token = _new_token("mymoney_access_")
    session.access_token_hash = _token_hash(access_token)
    session.access_expires_at = now + ACCESS_TOKEN_SECONDS
    session.refresh_expires_at = now + REFRESH_TOKEN_SECONDS
    db.commit()
    _set_refresh_cookie(response, refresh_token, request)
    return _session_response(session, access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
) -> Response:
    _verify_cookie_origin(request)
    if refresh_token:
        session = db.scalar(
            select(AuthSession).where(AuthSession.refresh_token_hash == _token_hash(refresh_token))
        )
        if session is not None:
            db.delete(session)
            db.commit()
    response.delete_cookie(
        REFRESH_COOKIE,
        httponly=True,
        secure=_cookie_secure(request),
        samesite=settings.session_cookie_samesite,
        path="/",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me")
def me(user: Profile = Depends(get_current_user)) -> dict[str, str]:
    return {"id": str(user.id), "email": user.email}
