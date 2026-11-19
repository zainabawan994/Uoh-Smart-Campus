"""Admin user moderation."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_roles
from app.database import get_db
from app.models import User, UserRole
from app.schemas import MessageResponse, UserOut, UserRoleUpdate

router = APIRouter(prefix="/api/users", tags=["users (admin)"])
admin_only = require_roles(UserRole.admin)


@router.get("", response_model=list[UserOut])
async def list_users(
    search: Optional[str] = None,
    role: Optional[UserRole] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_only),
):
    stmt = select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(User.full_name.ilike(like), User.reg_no.ilike(like), User.email.ilike(like))
        )
    if role:
        stmt = stmt.where(User.role == role)
    return (await db.execute(stmt)).scalars().all()


@router.patch("/{user_id}/role", response_model=UserOut)
async def change_role(
    user_id: uuid.UUID,
    data: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(admin_only),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id and data.role != UserRole.admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove your own admin role")
    user.role = data.role
    await db.flush()
    return user


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(admin_only),
):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await db.delete(user)
    return MessageResponse(detail="User deleted")


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)):
    rows = (await db.execute(select(User.role, func.count()).group_by(User.role))).all()
    return {role.value: count for role, count in rows}
