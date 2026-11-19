"""FastAPI entry point. Run with:  uvicorn app.main:app --reload  (from the backend folder)."""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import AsyncSessionLocal, close_db, init_db
from app.routers import auth, cafe, chat, emergency, events, posts, timetable, users
from app.scraper import sync_events
from app.security import RedactTokenFilter, ensure_first_admin, security_headers_middleware, staff_on_seed_passwords
from app.ws_manager import chat_manager, emergency_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("uoh")
for _name in ("uvicorn.access", "uvicorn.error"):
    logging.getLogger(_name).addFilter(RedactTokenFilter())

scheduler = AsyncIOScheduler(timezone="UTC")


async def scheduled_event_sync() -> None:
    try:
        async with AsyncSessionLocal() as db:
            await sync_events(db)
    except Exception:
        log.exception("Scheduled event sync failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.SECRET_KEY in ("change-me", "change-me-to-a-long-random-string"):
        log.warning("SECRET_KEY is the default value. Set a random SECRET_KEY in .env before deploying.")
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    await init_db()
    async with AsyncSessionLocal() as db:
        created = await ensure_first_admin(db)
        weak = await staff_on_seed_passwords(db)
    if created:
        log.info("Created the first admin account %s from ADMIN_PASSWORD.", created)
    if weak:
        message = f"Staff accounts still use the public seed passwords: {', '.join(weak)}. Change them (Change password in the app)."
        if settings.ENVIRONMENT == "production":
            raise RuntimeError(message)
        log.warning(message)

    scheduler.add_job(
        scheduled_event_sync,
        "interval",
        hours=settings.SCRAPE_INTERVAL_HOURS,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=15),  # first sync shortly after boot
        id="uoh_event_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.start()
    log.info("Started. Event scraper runs every %d hours.", settings.SCRAPE_INTERVAL_HOURS)
    yield
    scheduler.shutdown(wait=False)
    await close_db()


app = FastAPI(
    title="UoH Smart Campus & Emergency Portal",
    description="University of Haripur, KP, Pakistan: SOS alerts, social feed, live chat, timetable, cafeteria and events.",
    version="1.0.0",
    lifespan=lifespan,
)

app.middleware("http")(security_headers_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

for module in (auth, users, emergency, posts, chat, timetable, cafe, events):
    app.include_router(module.router)
for module in (emergency, chat, cafe):
    app.include_router(module.ws_router)


@app.get("/api/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "emergency_dashboards_connected": emergency_manager.count,
        "chat_users_online": len(chat_manager.online_users()),
    }


DIST = Path(settings.FRONTEND_DIST).resolve()
if (DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend(full_path: str):
        """Serve the React app; unknown paths get index.html so client-side routes like /cafe work."""
        if full_path.startswith(("api/", "ws/", "uploads/")):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        file = (DIST / full_path).resolve()
        if full_path and file.is_file() and DIST in file.parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
