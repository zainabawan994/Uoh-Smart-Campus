"""Password hashing, JWT handling and role-based access dependencies."""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import Depends, HTTPException, Request, Response, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        return False


# Compared against when the account does not exist, so response time does not reveal valid IDs.
DUMMY_HASH = pwd_context.hash("not-a-real-password-0")


def password_stamp(user: User) -> str:
    """Changes whenever the password changes, which invalidates every older token."""
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id), "role": user.role.value, "pwd": password_stamp(user),
        "iat": now, "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[tuple[uuid.UUID, str]]:
    """Return (user id, password stamp) from a valid token, or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return uuid.UUID(payload["sub"]), payload.get("pwd", "")
    except (JWTError, KeyError, ValueError, TypeError):
        return None


def _valid_user(user: Optional[User], stamp: str) -> Optional[User]:
    return user if user is not None and stamp == password_stamp(user) else None


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.COOKIE_NAME, token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True, secure=settings.COOKIE_SECURE, samesite=settings.COOKIE_SAMESITE, path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.COOKIE_NAME, path="/", secure=settings.COOKIE_SECURE,
                           httponly=True, samesite=settings.COOKIE_SAMESITE)


async def get_current_user(
    request: Request, token: Optional[str] = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    # Browser uses the httpOnly cookie; API clients and Swagger may send a Bearer header.
    token = token or request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise CREDENTIALS_ERROR
    decoded = decode_token(token)
    if decoded is None:
        raise CREDENTIALS_ERROR
    user = _valid_user(await db.get(User, decoded[0]), decoded[1])
    if user is None:
        raise CREDENTIALS_ERROR
    return user


def require_roles(*roles: UserRole):
    """Dependency factory. Admins pass every role check."""
    allowed = set(roles) | {UserRole.admin}

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this resource")
        return user

    return checker


async def get_ws_user(websocket: WebSocket, token: Optional[str] = None) -> Optional[User]:
    """Authenticate a WebSocket from the session cookie (browser) or ?token= (other clients)."""
    origin = websocket.headers.get("origin")
    # Cookies ride along on cross-site WebSocket handshakes, so only trusted pages may connect with one:
    # the site's own domain, or an origin listed in CORS_ORIGINS.
    same_site = origin and urlparse(origin).netloc == websocket.headers.get("host")
    if origin and not same_site and origin not in settings.cors_origins_list and not token:
        return None
    token = token or websocket.cookies.get(settings.COOKIE_NAME)
    if not token:
        return None
    decoded = decode_token(token)
    if decoded is None:
        return None
    async with AsyncSessionLocal() as session:
        return _valid_user(await session.get(User, decoded[0]), decoded[1])
