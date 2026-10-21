from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Profile

bearer = HTTPBearer(auto_error=False)


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str | None = None


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
    return GoogleIdentity(sub=claims["sub"], email=claims["email"].lower(), name=claims.get("name"))


def get_identity(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> GoogleIdentity:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
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
