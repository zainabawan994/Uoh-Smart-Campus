"""WebSocket connection managers for emergency alerts, live chat and cafe updates."""
import asyncio
import logging
from collections import deque
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

from app.models import User

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self, name: str) -> None:
        self.name = name
        self._connections: dict[WebSocket, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user: User | None = None) -> None:
        await websocket.accept()
        info = {}
        if user is not None:
            info = {
                "id": str(user.id),
                "full_name": user.full_name,
                "reg_no": user.reg_no,
                "department": user.department,
                "role": user.role.value,
            }
        async with self._lock:
            self._connections[websocket] = info

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.pop(websocket, None)

    async def send(self, websocket: WebSocket, data: Any) -> None:
        await websocket.send_json(jsonable_encoder(data))

    async def broadcast(self, data: Any) -> None:
        payload = jsonable_encoder(data)
        async with self._lock:
            targets = list(self._connections)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:  # client went away mid-send
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)
        if dead:
            log.info("[%s] dropped %d stale connections", self.name, len(dead))

    def online_users(self) -> list[dict[str, Any]]:
        """Unique connected users (one entry per user even with several tabs open)."""
        seen: dict[str, dict[str, Any]] = {}
        for info in self._connections.values():
            if info.get("id"):
                seen[info["id"]] = info
        return list(seen.values())

    @property
    def count(self) -> int:
        return len(self._connections)


class ChatManager(ConnectionManager):
    """Chat keeps the last N messages in memory so new clients see recent history."""

    def __init__(self, history_size: int = 100) -> None:
        super().__init__("chat")
        self.history: deque[dict[str, Any]] = deque(maxlen=history_size)

    async def broadcast_presence(self) -> None:
        await self.broadcast({"type": "presence", "users": self.online_users()})


emergency_manager = ConnectionManager("emergency")
chat_manager = ChatManager()
cafe_manager_ws = ConnectionManager("cafe")
