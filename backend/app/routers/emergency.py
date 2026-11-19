"""Emergency SOS: REST endpoints plus the /ws/emergency real-time channel."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, get_ws_user, require_roles
from app.database import AsyncSessionLocal, get_db
from app.models import AlertStatus, EmergencyAlert, User, UserRole
from app.schemas import AlertOut, AlertStatusUpdate, SOSCreate
from app.ws_manager import emergency_manager

router = APIRouter(prefix="/api/emergency", tags=["emergency"])
ws_router = APIRouter(tags=["websockets"])

security_staff = require_roles(UserRole.security)
DUPLICATE_WINDOW = timedelta(seconds=30)

# Allowed status changes. Security may skip straight to resolved (e.g. false alarm).
TRANSITIONS: dict[AlertStatus, set[AlertStatus]] = {
    AlertStatus.active: {AlertStatus.dispatched, AlertStatus.resolved},
    AlertStatus.dispatched: {AlertStatus.resolved},
    AlertStatus.resolved: set(),
}


async def _load_alert(db: AsyncSession, alert_id: uuid.UUID) -> Optional[EmergencyAlert]:
    result = await db.execute(
        select(EmergencyAlert)
        .options(selectinload(EmergencyAlert.user))
        .where(EmergencyAlert.id == alert_id)
        # reload server-generated columns (created_at) without lazy loading in async code
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


@router.post("/sos", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
async def send_sos(
    data: SOSCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Guard against accidental double taps creating several alerts.
    since = datetime.now(timezone.utc) - DUPLICATE_WINDOW
    recent = await db.execute(
        select(EmergencyAlert.id).where(
            EmergencyAlert.user_id == user.id,
            EmergencyAlert.status == AlertStatus.active,
            EmergencyAlert.created_at >= since,
        )
    )
    existing_id = recent.scalars().first()
    if existing_id:
        alert = await _load_alert(db, existing_id)
        return AlertOut.model_validate(alert)

    alert = EmergencyAlert(
        user_id=user.id,
        alert_type=data.alert_type,
        latitude=data.latitude,
        longitude=data.longitude,
        location_note=(data.location_note or "").strip() or None,
        status=AlertStatus.active,
    )
    db.add(alert)
    await db.flush()
    alert = await _load_alert(db, alert.id)
    out = AlertOut.model_validate(alert)
    await db.commit()  # persist before notifying the control room

    await emergency_manager.broadcast({"type": "new_alert", "alert": out.model_dump()})
    return out


@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(
    status_filter: Optional[AlertStatus] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(security_staff),
):
    stmt = (
        select(EmergencyAlert)
        .options(selectinload(EmergencyAlert.user))
        .order_by(EmergencyAlert.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(EmergencyAlert.status == status_filter)
    return (await db.execute(stmt)).scalars().all()


@router.get("/my", response_model=list[AlertOut])
async def my_alerts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(EmergencyAlert)
        .options(selectinload(EmergencyAlert.user))
        .where(EmergencyAlert.user_id == user.id)
        .order_by(EmergencyAlert.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.patch("/alerts/{alert_id}/status", response_model=AlertOut)
async def update_status(
    alert_id: uuid.UUID,
    data: AlertStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(security_staff),
):
    alert = await _load_alert(db, alert_id)
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if data.status not in TRANSITIONS[alert.status]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot change status from {alert.status.value} to {data.status.value}",
        )
    alert.status = data.status
    if data.status == AlertStatus.resolved:
        alert.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    out = AlertOut.model_validate(alert)
    await db.commit()

    await emergency_manager.broadcast({"type": "alert_updated", "alert": out.model_dump()})
    return out


@ws_router.websocket("/ws/emergency")
async def emergency_ws(websocket: WebSocket, token: Optional[str] = None):
    user = await get_ws_user(websocket, token)
    if user is None or user.role not in (UserRole.security, UserRole.admin):
        # Accept first so the browser receives the close code (a pre-accept close shows as 1006).
        await websocket.accept()
        await websocket.close(code=4401 if user is None else 4403, reason="Security staff only")
        return

    await emergency_manager.connect(websocket, user)
    try:
        # Send the open alerts so a freshly opened dashboard is up to date.
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EmergencyAlert)
                .options(selectinload(EmergencyAlert.user))
                .where(EmergencyAlert.status != AlertStatus.resolved)
                .order_by(EmergencyAlert.created_at.desc())
            )
            snapshot = [AlertOut.model_validate(a).model_dump() for a in result.scalars().all()]
        await emergency_manager.send(websocket, {"type": "snapshot", "alerts": snapshot})

        while True:
            msg = await websocket.receive_text()  # clients only send keep-alive pings
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await emergency_manager.disconnect(websocket)
