"""Login throttling, password strength rules, security headers and token redaction in logs."""
import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LoginFailure

# --------------------------- Brute-force protection --------------------------- #
MAX_FAILURES = 5          # per account+IP inside the window
MAX_IP_FAILURES = 30      # per IP across all accounts (stops guessing many IDs)
WINDOW = timedelta(minutes=15)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _count(db: AsyncSession, key: str) -> int:
    since = datetime.now(timezone.utc) - WINDOW
    return await db.scalar(
        select(func.count()).select_from(LoginFailure).where(LoginFailure.key == key, LoginFailure.created_at > since)
    )


async def check_login_allowed(db: AsyncSession, ip: str, identifier: str) -> None:
    if await _count(db, f"acct:{identifier}:{ip}") >= MAX_FAILURES or await _count(db, f"ip:{ip}") >= MAX_IP_FAILURES:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed sign-in attempts. Please wait 15 minutes and try again.",
        )


async def record_login_failure(db: AsyncSession, ip: str, identifier: str) -> None:
    """Commits at once: the request then raises, and the session would roll back otherwise."""
    db.add_all([LoginFailure(key=f"acct:{identifier}:{ip}"[:300]), LoginFailure(key=f"ip:{ip}"[:300])])
    await db.execute(delete(LoginFailure).where(LoginFailure.created_at < datetime.now(timezone.utc) - WINDOW))
    await db.commit()


async def clear_login_failures(db: AsyncSession, ip: str, identifier: str) -> None:
    await db.execute(delete(LoginFailure).where(LoginFailure.key == f"acct:{identifier}:{ip}"[:300]))


# --------------------------- Published seed passwords ------------------------- #
# The defaults in seed.py are public (they are in this repository), so they must never reach production.
DEV_SEED_PASSWORDS = {
    "student": "Student@123", "security": "Security@123", "cafe_manager": "Cafe@123", "admin": "Admin@123",
}


async def staff_on_seed_passwords(db: AsyncSession) -> list[str]:
    """Registration IDs of admin/security/cafe accounts still using a published seed password."""
    from app.auth import verify_password
    from app.models import User, UserRole

    staff = (await db.execute(select(User).where(User.role != UserRole.student))).scalars().all()
    return [u.reg_no for u in staff if verify_password(DEV_SEED_PASSWORDS[u.role.value], u.password_hash)]


async def ensure_first_admin(db: AsyncSession) -> str | None:
    """Create the first admin from ADMIN_PASSWORD when the database has none. Returns its reg no if created."""
    from app.auth import hash_password
    from app.config import settings
    from app.models import User, UserRole

    if not settings.ADMIN_PASSWORD:
        return None
    if await db.scalar(select(func.count()).select_from(User).where(User.role == UserRole.admin)):
        return None
    problem = password_problem(settings.ADMIN_PASSWORD, settings.ADMIN_REG_NO, settings.ADMIN_EMAIL.split("@")[0])
    if problem:
        raise RuntimeError(f"ADMIN_PASSWORD is too weak: {problem}")
    db.add(User(
        reg_no=settings.ADMIN_REG_NO.upper(), full_name=settings.ADMIN_NAME, email=settings.ADMIN_EMAIL.lower(),
        department="Administration", semester=1, section="A", role=UserRole.admin,
        password_hash=hash_password(settings.ADMIN_PASSWORD),
    ))
    await db.commit()
    return settings.ADMIN_REG_NO.upper()


# ------------------------------ Password strength ----------------------------- #
COMMON = {"password", "password1", "12345678", "123456789", "qwerty123", "11111111", "iloveyou", "pakistan", "uoh12345"}


def password_problem(password: str, *personal: str) -> str | None:
    """Return why a password is weak, or None if acceptable."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password.encode()) > 72:  # bcrypt ignores everything after 72 bytes
        return "Password must be at most 72 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain at least one letter and one number."
    lowered = password.lower()
    if lowered in COMMON or len(set(lowered)) < 4:
        return "This password is too easy to guess. Choose a less common one."
    for value in personal:
        if value and len(value) >= 4 and value.lower() in lowered:
            return "Password must not contain your registration ID or email."
    return None


# ------------------------------- HTTP hardening ------------------------------- #
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
}


async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


class RedactTokenFilter(logging.Filter):
    """WebSockets pass the JWT as ?token=; keep it out of access logs."""

    pattern = re.compile(r"token=[^\s&\"']+")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(self.pattern.sub("token=[redacted]", a) if isinstance(a, str) else a for a in record.args)
        if isinstance(record.msg, str):
            record.msg = self.pattern.sub("token=[redacted]", record.msg)
        return True
