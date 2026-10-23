import hashlib
import secrets
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import AuthSession, Profile

bearer = HTTPBearer(auto_error=False)
ACCESS_TOKEN_PREFIX = "mymoney_access_"
REFRESH_COOKIE = "mymoney_refresh"
ACCESS_TOKEN_SECONDS = 15 * 60
REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str | None = None
    picture: str | None = None


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _new_token(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(32)


def _cookie_secure(request: Request) -> bool:
    if settings.session_cookie_samesite == "none":
        return True
    if settings.session_cookie_secure is not None:
        return settings.session_cookie_secure
    return (
        request.url.scheme == "https"
        or settings.app_url.startswith("https://")
        or settings.session_cookie_samesite == "none"
    )


def _set_refresh_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=REFRESH_TOKEN_SECONDS,
        httponly=True,
        secure=_cookie_secure(request),
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def _session_response(session: AuthSession, access_token: str) -> dict:
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "sub": session.google_sub,
            "email": session.email,
            "name": session.name,
            "picture": session.picture,
            "exp": session.access_expires_at,
        },
    }


def create_session(
    identity: GoogleIdentity, db: Session, response: Response, request: Request
) -> dict:
    now = int(time.time())
    access_token = _new_token(ACCESS_TOKEN_PREFIX)
    refresh_token = _new_token("mymoney_refresh_")
    session = AuthSession(
        google_sub=identity.sub,
        email=identity.email,
        name=identity.name,
        picture=identity.picture,
        access_token_hash=_token_hash(access_token),
        refresh_token_hash=_token_hash(refresh_token),
        access_expires_at=now + ACCESS_TOKEN_SECONDS,
        refresh_expires_at=now + REFRESH_TOKEN_SECONDS,
    )
    db.add(session)
    db.commit()
    _set_refresh_cookie(response, refresh_token, request)
    return _session_response(session, access_token)


def verify_google_token(token: str) -> GoogleIdentity:
    """Verify signature, audience and expiry of a Google ID token."""
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token") from exc
    if not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email not verified")
    return GoogleIdentity(
        sub=claims["sub"],
        email=claims["email"].lower(),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )


def get_identity(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> GoogleIdentity:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    if creds.credentials.startswith(ACCESS_TOKEN_PREFIX):
        session = db.scalar(
            select(AuthSession).where(
                AuthSession.access_token_hash == _token_hash(creds.credentials)
            )
        )
        if session is None or session.access_expires_at <= int(time.time()):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
        return GoogleIdentity(
            sub=session.google_sub,
            email=session.email,
            name=session.name,
            picture=session.picture,
        )
    # Keep direct Google-token authentication working for older clients during rollout.
    return verify_google_token(creds.credentials)


def get_current_user(
    identity: GoogleIdentity = Depends(get_identity), db: Session = Depends(get_db)
) -> Profile:
    """Upsert the identity row by google_sub and return it."""
    profile = db.scalar(select(Profile).where(Profile.google_sub == identity.sub))
    if profile is None:
        profile = Profile(google_sub=identity.sub, email=identity.email)
        db.add(profile)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent first request created the row (or the email moved accounts).
            db.rollback()
            profile = db.scalar(select(Profile).where(Profile.google_sub == identity.sub))
            if profile is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from None
    elif profile.email != identity.email:
        profile.email = identity.email
        db.commit()
    db.refresh(profile)
    return profile
