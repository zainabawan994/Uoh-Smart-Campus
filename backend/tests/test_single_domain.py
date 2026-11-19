"""Check the production layout: one server serves the site, API and WebSockets.

Run against a backend started with the built frontend present:
    API=http://127.0.0.1:8010 python -m tests.test_single_domain
"""
import asyncio
import json
import os

import httpx
import websockets

BASE = os.environ.get("API", "http://127.0.0.1:8010")


def main():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        for path in ("/", "/cafe", "/events", "/login"):  # client-side routes all return the app
            r = c.get(path)
            assert r.status_code == 200 and '<div id="root">' in r.text, (path, r.status_code)
        asset = next(part.split('"')[1] for part in r.text.split("src=")[1:] if "/assets/" in part)
        assert c.get(asset).status_code == 200, asset
        print("site + client routes + assets: ok")

        assert c.get("/api/health").json()["status"] == "ok"
        assert c.get("/api/nope").status_code == 404 and "application/json" in c.get("/api/nope").headers["content-type"]
        assert c.get("/docs").status_code == 200
        print("API, 404s and docs not swallowed by the site: ok")

        r = c.post("/api/auth/login", json={"identifier": "F23-0382", "password": "Student@123"})
        assert r.status_code == 200, r.text
        session = r.cookies["uoh_session"]

    async def ws(origin):
        url = BASE.replace("http", "ws") + "/ws/chat"
        async with websockets.connect(url, additional_headers={"Cookie": f"uoh_session={session}", "Origin": origin}) as s:
            try:
                return json.loads(await s.recv()).get("type") == "history"
            except websockets.ConnectionClosed:
                return False

    host = BASE.split("//")[1]
    assert asyncio.run(ws(f"http://{host}")) is True, "own domain must be trusted without CORS_ORIGINS"
    assert asyncio.run(ws("https://evil.example")) is False
    print("WebSocket on own domain (no CORS config needed): ok")
    print("SINGLE-DOMAIN SETUP OK")


if __name__ == "__main__":
    main()
