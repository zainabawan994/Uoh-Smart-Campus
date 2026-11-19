"""End-to-end check of write actions against a running backend; cleans up after itself.

Run (backend must be running on 8001):  python -m tests.test_write_flows
Leaves one RESOLVED test SOS alert behind, because alerts have no delete endpoint.
"""
import asyncio
import json
import os
import uuid

import httpx
import websockets

BASE = os.environ.get("API", "http://127.0.0.1:8001")
SEED = {"admin": ("A00-0001", "Admin@123"), "student": ("F23-0382", "Student@123"),
        "cafe": ("C00-0001", "Cafe@123"), "security": ("S00-0001", "Security@123")}


def login(c, ident, pw):
    r = c.post("/api/auth/login", json={"identifier": ident, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}, r.json()["access_token"]


def ok(r, code=200):
    assert r.status_code == code, f"{r.request.method} {r.request.url.path} -> {r.status_code} {r.text[:200]}"
    return r.json() if r.content else None


async def chat_roundtrip(token):
    url = BASE.replace("http", "ws") + f"/ws/chat?token={token}"
    async with websockets.connect(url) as ws:
        assert json.loads(await ws.recv())["type"] == "history"
        text = f"e2e test {uuid.uuid4().hex[:6]}"
        await ws.send(json.dumps({"message": text}))
        for _ in range(5):
            msg = json.loads(await ws.recv())
            if msg.get("message") == text:
                return
        raise AssertionError("chat message was not echoed back")


def main():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        H = {role: login(c, *cred) for role, cred in SEED.items()}

        # Register a new student, then remove it as admin.
        reg = f"T{uuid.uuid4().int % 90 + 10}-{uuid.uuid4().int % 9000 + 1000}"
        new = ok(c.post("/api/auth/register", json={
            "reg_no": reg, "full_name": "E2E Test", "email": f"{reg.lower()}@example.com",
            "department": "Computer Science", "semester": 1, "section": "A", "password": "Testpass123"}), 201)
        ok(c.post("/api/auth/register", json={
            "reg_no": reg, "full_name": "Dup", "email": f"x{reg.lower()}@example.com",
            "department": "Computer Science", "semester": 1, "section": "A", "password": "Testpass123"}), 409)
        ok(c.delete(f"/api/users/{new['user']['id']}", headers=H["admin"][0]))
        print("register / duplicate / delete user: ok")

        # Feed: post, like, comment, reply, delete; students cannot post announcements.
        post = ok(c.post("/api/posts", data={"content": "E2E test post", "category": "general"}, headers=H["student"][0]), 201)
        ok(c.post(f"/api/posts/{post['id']}/like", headers=H["student"][0]))
        com = ok(c.post(f"/api/posts/{post['id']}/comments", json={"comment_text": "hi"}, headers=H["student"][0]), 201)
        ok(c.post(f"/api/posts/{post['id']}/comments", json={"comment_text": "reply", "parent_id": com["id"]}, headers=H["admin"][0]), 201)
        ok(c.post("/api/posts", data={"content": "x", "category": "announcement"}, headers=H["student"][0]), 403)
        ok(c.delete(f"/api/posts/{post['id']}", headers=H["student"][0]))
        print("feed post / like / comment / reply / delete: ok")

        # SOS: student raises, security dispatches and resolves.
        alert = ok(c.post("/api/emergency/sos", json={
            "alert_type": "medical", "latitude": 33.9946, "longitude": 72.9106, "location_note": "E2E TEST - ignore"},
            headers=H["student"][0]), 201)
        ok(c.patch(f"/api/emergency/alerts/{alert['id']}/status", json={"status": "dispatched"}, headers=H["security"][0]))
        ok(c.patch(f"/api/emergency/alerts/{alert['id']}/status", json={"status": "resolved"}, headers=H["security"][0]))
        ok(c.patch(f"/api/emergency/alerts/{alert['id']}/status", json={"status": "resolved"}, headers=H["student"][0]), 403)
        print("SOS raise / dispatch / resolve: ok")

        # Cafe: manager creates, toggles, edits, deletes; students cannot.
        item = ok(c.post("/api/cafe/menu", json={"item_name": "E2E Tea", "category": "beverages", "price": 50}, headers=H["cafe"][0]), 201)
        ok(c.patch(f"/api/cafe/menu/{item['id']}/availability", json={"is_available": False}, headers=H["cafe"][0]))
        ok(c.patch(f"/api/cafe/menu/{item['id']}", json={"price": 60}, headers=H["cafe"][0]))
        ok(c.post("/api/cafe/menu", json={"item_name": "x", "category": "snacks", "price": 1}, headers=H["student"][0]), 403)
        ok(c.delete(f"/api/cafe/menu/{item['id']}", headers=H["cafe"][0]))
        print("cafe create / toggle / edit / delete: ok")

        # Timetable: admin creates, edits, deletes.
        entry = {"department": "Computer Science", "semester": 9, "section": "Z", "day_of_week": "monday",
                 "subject_name": "E2E Test", "teacher_name": "Test", "room_no": "R1",
                 "start_time": "08:00:00", "end_time": "09:00:00"}
        tt = ok(c.post("/api/timetable", json=entry, headers=H["admin"][0]), 201)
        ok(c.put(f"/api/timetable/{tt['id']}", json={**entry, "room_no": "R2"}, headers=H["admin"][0]))
        ok(c.delete(f"/api/timetable/{tt['id']}", headers=H["admin"][0]))
        print("timetable create / edit / delete: ok")

        # Events: import rejects non-social / internal URLs.
        ok(c.post("/api/events/import", json={"url": "http://127.0.0.1:5432/x"}, headers=H["admin"][0]), 400)
        ok(c.post("/api/events/import", json={"url": "https://www.facebook.com/x"}, headers=H["student"][0]), 403)
        print("event import guards: ok")

        asyncio.run(chat_roundtrip(H["student"][1]))
        print("live chat send / receive: ok")
    print("ALL WRITE FLOWS OK")


if __name__ == "__main__":
    main()
