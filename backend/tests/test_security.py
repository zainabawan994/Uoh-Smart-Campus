"""Security checks against a running backend. Run: python -m tests.test_security  (from backend/)

Note: adds 6 failed logins for a non-existent account from this machine; they expire after 15 minutes.
"""
import asyncio
import json
import os
import time
import uuid

import httpx
import websockets

from app.security import password_problem

BASE = os.environ.get("API", "http://127.0.0.1:8001")
STUDENT = ("F23-0382", "Student@123")


def main():
    # Password rules (pure function).
    assert password_problem("short1") and password_problem("abcdefgh") and password_problem("12345678")
    assert password_problem("password1") and password_problem("F23-0382abc", "F23-0382")
    assert password_problem("a1" * 40)  # over bcrypt's 72-byte limit
    assert password_problem("Campus2026x") is None
    print("password rules: ok")

    with httpx.Client(base_url=BASE, timeout=30) as c:
        # Weak signup password rejected by the API.
        r = c.post("/api/auth/register", json={
            "reg_no": "T99-9999", "full_name": "Weak", "email": "weak@example.com",
            "department": "Computer Science", "semester": 1, "section": "A", "password": "aaaaaaaa"})
        assert r.status_code == 422, r.text
        print("weak signup password rejected: ok")

        # Security headers present.
        h = c.get("/api/health").headers
        for name in ("x-content-type-options", "x-frame-options", "referrer-policy"):
            assert name in h, name
        print("security headers: ok")

        # Unknown ID and wrong password look identical (message and roughly timing).
        def timed(ident, pw):
            t = time.perf_counter(); r = c.post("/api/auth/login", json={"identifier": ident, "password": pw})
            return r, time.perf_counter() - t
        ghost = f"Z{uuid.uuid4().int % 90 + 10}-{uuid.uuid4().int % 9000 + 1000}"
        r1, t1 = timed(ghost, "Wrongpass1")
        r2, t2 = timed(STUDENT[0], "Wrongpass1")
        assert r1.status_code == r2.status_code == 401 and r1.json() == r2.json()
        assert abs(t1 - t2) < 0.25, (t1, t2)
        c.post("/api/auth/login", json={"identifier": STUDENT[0], "password": STUDENT[1]})  # clear the real account's counter
        print(f"no account enumeration: ok ({t1:.2f}s vs {t2:.2f}s)")

        # Brute force: after 5 failures (1 above + 4 here) the next attempt is blocked.
        codes = [c.post("/api/auth/login", json={"identifier": ghost, "password": f"Guess{i}x"}).status_code for i in range(4)]
        assert codes == [401] * 4, codes
        r = c.post("/api/auth/login", json={"identifier": ghost, "password": "Guess9x"})
        assert r.status_code == 429, r.status_code
        print("login throttling: ok")

        # Change password signs out old tokens; then restore the seed password.
        old = c.post("/api/auth/login", json={"identifier": STUDENT[0], "password": STUDENT[1]}).json()["access_token"]
        auth = {"Authorization": f"Bearer {old}"}
        assert c.post("/api/auth/change-password", headers=auth, json={"current_password": "nope", "new_password": "Campus2026x"}).status_code == 400
        assert c.post("/api/auth/change-password", headers=auth, json={"current_password": STUDENT[1], "new_password": "aaaaaaaa1"}).status_code == 422
        r = c.post("/api/auth/change-password", headers=auth, json={"current_password": STUDENT[1], "new_password": "Campus2026x"})
        assert r.status_code == 200, r.text
        new = r.json()["access_token"]
        assert c.get("/api/auth/me", headers=auth).status_code == 401, "old token still works"
        assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {new}"}).status_code == 200
        r = c.post("/api/auth/change-password", headers={"Authorization": f"Bearer {new}"},
                   json={"current_password": "Campus2026x", "new_password": STUDENT[1]})
        assert r.status_code == 200, r.text
        print("change password + old sessions revoked: ok")

        # Browser session: httpOnly cookie, works without a header, logout clears it.
        with httpx.Client(base_url=BASE, timeout=30) as browser:
            r = browser.post("/api/auth/login", json={"identifier": STUDENT[0], "password": STUDENT[1]})
            cookie = r.headers.get("set-cookie", "")
            assert "uoh_session=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower(), cookie
            assert browser.get("/api/auth/me").status_code == 200
            browser.post("/api/auth/logout")
            assert browser.get("/api/auth/me").status_code == 401
        print("httpOnly cookie session + logout: ok")

        # Cookie WebSocket from an untrusted site is refused (cross-site WebSocket hijacking).
        session = c.post("/api/auth/login", json={"identifier": STUDENT[0], "password": STUDENT[1]}).cookies["uoh_session"]

        async def ws_ok(origin):
            url = BASE.replace("http", "ws") + "/ws/chat"
            headers = {"Cookie": f"uoh_session={session}", "Origin": origin}
            async with websockets.connect(url, additional_headers=headers) as ws:
                try:
                    return json.loads(await ws.recv()).get("type") == "history"
                except websockets.ConnectionClosed:
                    return False
        assert asyncio.run(ws_ok("http://localhost:5173")) is True
        assert asyncio.run(ws_ok("https://evil.example")) is False
        print("WebSocket origin check: ok")

        # Tampered token rejected.
        bad = new[:-4] + ("AAAA" if not new.endswith("AAAA") else "BBBB")
        assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
        print("tampered token rejected: ok")
    print("ALL SECURITY CHECKS OK")


if __name__ == "__main__":
    main()
