from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (DUMMY_HASH, clear_session_cookie, create_access_token, get_current_user, hash_password,
                      set_session_cookie, verify_password)
from app.database import get_db
from app.models import User, UserRole
from app.schemas import MessageResponse, PasswordChange, Token, UserCreate, UserLogin, UserOut
from app.security import (check_login_allowed, clear_login_failures, client_ip, password_problem,
                          record_login_failure)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session(response: Response, user: User) -> Token:
    token = create_access_token(user)
    set_session_cookie(response, token)
    return Token(access_token=token, user=UserOut.model_validate(user))


async def _authenticate(db: AsyncSession, identifier: str, password: str, ip: str) -> User:
    ident = identifier.strip()
    key = ident.lower()
    await check_login_allowed(db, ip, key)
    result = await db.execute(
        select(User).where(
            or_(User.reg_no == ident.upper(), func.lower(User.email) == ident.lower())
        )
    )
    user = result.scalar_one_or_none()
    # Always run bcrypt, so unknown IDs take as long as wrong passwords.
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        await record_login_failure(db, ip, key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid registration ID/email or password")
    await clear_login_failures(db, ip, key)
    return user


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(response: Response, data: UserCreate, db: AsyncSession = Depends(get_db)):
    email = data.email.lower()
    existing = await db.execute(
        select(User).where(or_(User.reg_no == data.reg_no, func.lower(User.email) == email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Registration ID or email already registered")

    user = User(
        reg_no=data.reg_no,
        full_name=data.full_name.strip(),
        email=email,
        department=data.department.strip(),
        semester=data.semester,
        section=data.section,
        role=UserRole.student,  # elevated roles are assigned by an admin only
        password_hash=hash_password(data.password),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:  # two signups with the same ID/email at the same moment
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Registration ID or email already registered")
    await db.refresh(user)
    return _session(response, user)


@router.post("/login", response_model=Token)
async def login(response: Response, data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _authenticate(db, data.identifier, data.password, client_ip(request))
    return _session(response, user)


@router.post("/token", response_model=Token, include_in_schema=True)
async def login_form(response: Response, request: Request, form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """OAuth2 form login, used by the Swagger 'Authorize' button. Username = reg no or email."""
    user = await _authenticate(db, form.username, form.password, client_ip(request))
    return _session(response, user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=Token)
async def change_password(response: Response, 
    data: PasswordChange, request: Request,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Change your password. Every other session is signed out; a fresh token is returned."""
    ip, key = client_ip(request), f"change:{user.id}"
    await check_login_allowed(db, ip, key)
    if not verify_password(data.current_password, user.password_hash):
        await record_login_failure(db, ip, key)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different from the current one")
    problem = password_problem(data.new_password, user.reg_no, user.email.split("@")[0])
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    user.password_hash = hash_password(data.new_password)
    await db.flush()
    await clear_login_failures(db, ip, key)
    return _session(response, user)


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    clear_session_cookie(response)
    return MessageResponse(detail="Signed out")
