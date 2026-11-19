"""Campus live group chat over /ws/chat. Recent history is kept in memory."""
import json
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import get_current_user, get_ws_user
from app.models import User
from app.schemas import ChatMessageIn, ChatMessageOut
from app.ws_manager import chat_manager

router = APIRouter(prefix="/api/chat", tags=["live chat"])
ws_router = APIRouter(tags=["websockets"])

MIN_SECONDS_BETWEEN_MESSAGES = 0.5


@router.get("/history")
async def chat_history(_: User = Depends(get_current_user)):
    return {"messages": list(chat_manager.history), "online": chat_manager.online_users()}


@ws_router.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket, token: Optional[str] = None):
    user = await get_ws_user(websocket, token)
    if user is None:
        await websocket.accept()
        await websocket.close(code=4401, reason="Authentication required")
        return

    await chat_manager.connect(websocket, user)
    await chat_manager.send(websocket, {"type": "history", "messages": list(chat_manager.history)})
    await chat_manager.broadcast_presence()

    last_sent = 0.0
    try:
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                await websocket.send_text("pong")
                continue
            try:
                incoming = ChatMessageIn.model_validate(json.loads(raw))
            except (json.JSONDecodeError, ValidationError):
                await chat_manager.send(websocket, {"type": "error", "detail": "Invalid message"})
                continue

            now = time.monotonic()
            if now - last_sent < MIN_SECONDS_BETWEEN_MESSAGES:
                await chat_manager.send(websocket, {"type": "error", "detail": "You are sending messages too fast"})
                continue
            last_sent = now

            msg = ChatMessageOut(
                sender_id=user.id,
                sender_name=user.full_name,
                reg_no=user.reg_no,
                department=user.department,
                message=incoming.message.strip(),
                timestamp=datetime.now(timezone.utc),
            ).model_dump(mode="json")
            chat_manager.history.append(msg)
            await chat_manager.broadcast(msg)
    except WebSocketDisconnect:
        pass
    finally:
        await chat_manager.disconnect(websocket)
        await chat_manager.broadcast_presence()
