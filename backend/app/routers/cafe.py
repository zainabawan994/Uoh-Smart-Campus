"""Cafeteria menu: public live board, cafe_manager CRUD, real-time availability via /ws/cafe."""
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_ws_user, require_roles
from app.database import get_db
from app.models import CafeCategory, CafeMenuItem, User, UserRole
from app.schemas import AvailabilityUpdate, CafeItemCreate, CafeItemOut, CafeItemUpdate, MessageResponse
from app.config import settings
from app.menu_ocr import MenuExtractionError, extract_menu
from app.uploads import _detect_image_ext, delete_owned_image, save_image
from app.ws_manager import cafe_manager_ws

router = APIRouter(prefix="/api/cafe", tags=["cafeteria"])
ws_router = APIRouter(tags=["websockets"])
manager_only = require_roles(UserRole.cafe_manager)


async def _get_item(db: AsyncSession, item_id: int) -> CafeMenuItem:
    item = await db.get(CafeMenuItem, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Menu item not found")
    return item


async def _save_and_broadcast(db: AsyncSession, item: CafeMenuItem, event: str) -> CafeItemOut:
    await db.flush()
    await db.refresh(item)  # load server-side updated_at
    out = CafeItemOut.model_validate(item)
    await db.commit()
    await cafe_manager_ws.broadcast({"type": event, "item": out.model_dump(mode="json")})
    return out


@router.get("/menu", response_model=list[CafeItemOut])
async def get_menu(
    search: Optional[str] = None,
    category: Optional[CafeCategory] = None,
    available_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(CafeMenuItem).order_by(CafeMenuItem.category, CafeMenuItem.item_name)
    if search:
        stmt = stmt.where(CafeMenuItem.item_name.ilike(f"%{search.strip()}%"))
    if category:
        stmt = stmt.where(CafeMenuItem.category == category)
    if available_only:
        stmt = stmt.where(CafeMenuItem.is_available.is_(True))
    return (await db.execute(stmt)).scalars().all()


@router.post("/menu", response_model=CafeItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(data: CafeItemCreate, db: AsyncSession = Depends(get_db), _: User = Depends(manager_only)):
    item = CafeMenuItem(**data.model_dump())
    item.item_name = item.item_name.strip()
    db.add(item)
    return await _save_and_broadcast(db, item, "item_created")


@router.post("/menu/extract", response_model=list[CafeItemCreate])
async def extract_menu_photo(image: UploadFile = File(...), _: User = Depends(manager_only)):
    """Read items from a menu photo. Nothing is saved; the manager reviews and publishes."""
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await image.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be under {settings.MAX_UPLOAD_MB} MB")
    ext = _detect_image_ext(data[:16])
    if ext is None:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPG, PNG, GIF or WEBP images are allowed")
    media_type = {".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}[ext]
    try:
        return await extract_menu(data, media_type)
    except MenuExtractionError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@router.patch("/menu/{item_id}", response_model=CafeItemOut)
async def update_item(
    item_id: int, data: CafeItemUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(manager_only)
):
    item = await _get_item(db, item_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value.strip() if key == "item_name" else value)
    return await _save_and_broadcast(db, item, "item_updated")


@router.put("/menu/{item_id}/image", response_model=CafeItemOut)
async def replace_item_image(
    item_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(manager_only),
):
    new_url = await save_image(image, "cafe")
    committed = False
    try:
        result = await db.execute(
            select(CafeMenuItem).where(CafeMenuItem.id == item_id).with_for_update()
        )
        item = result.scalar_one_or_none()
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Menu item not found")
        old_url = item.image_url
        item.image_url = new_url
        await db.flush()
        await db.refresh(item)
        out = CafeItemOut.model_validate(item)
        await db.commit()
        committed = True
        await cafe_manager_ws.broadcast({"type": "item_updated", "item": out.model_dump(mode="json")})
        delete_owned_image(old_url, "cafe")
        return out
    except Exception:
        if not committed:
            await db.rollback()
            delete_owned_image(new_url, "cafe")
        raise


@router.delete("/menu/{item_id}/image", response_model=CafeItemOut)
async def remove_item_image(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(manager_only),
):
    result = await db.execute(
        select(CafeMenuItem).where(CafeMenuItem.id == item_id).with_for_update()
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Menu item not found")
    old_url = item.image_url
    item.image_url = None
    await db.flush()
    await db.refresh(item)
    out = CafeItemOut.model_validate(item)
    await db.commit()
    await cafe_manager_ws.broadcast({"type": "item_updated", "item": out.model_dump(mode="json")})
    delete_owned_image(old_url, "cafe")
    return out


@router.patch("/menu/{item_id}/availability", response_model=CafeItemOut)
async def set_availability(
    item_id: int, data: AvailabilityUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(manager_only)
):
    item = await _get_item(db, item_id)
    item.is_available = data.is_available
    return await _save_and_broadcast(db, item, "item_updated")


@router.delete("/menu/{item_id}", response_model=MessageResponse)
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(manager_only)):
    item = await _get_item(db, item_id)
    image_url = item.image_url
    await db.delete(item)
    await db.commit()
    await cafe_manager_ws.broadcast({"type": "item_deleted", "item_id": item_id})
    delete_owned_image(image_url, "cafe")
    return MessageResponse(detail="Menu item deleted")


@ws_router.websocket("/ws/cafe")
async def cafe_ws(websocket: WebSocket, token: Optional[str] = None):
    user = await get_ws_user(websocket, token)
    if user is None:
        await websocket.accept()
        await websocket.close(code=4401, reason="Authentication required")
        return
    await cafe_manager_ws.connect(websocket, user)
    try:
        while True:
            if await websocket.receive_text() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await cafe_manager_ws.disconnect(websocket)
