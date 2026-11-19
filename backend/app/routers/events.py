from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import ScrapedEvent, User, UserRole
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.schemas import EventImport, EventOut, SyncResult
from app.scraper import CATEGORIES, PLATFORMS, fetch_preview, platform_of, sync_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    search: Optional[str] = None,
    category: Optional[str] = None,
    platform: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(ScrapedEvent).order_by(ScrapedEvent.scraped_at.desc(), ScrapedEvent.id.desc())
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(ScrapedEvent.title.ilike(like), ScrapedEvent.summary.ilike(like)))
    if category in CATEGORIES:
        # shortcut: keyword match, so an event using words from two categories can show under both filters.
        stmt = stmt.where(or_(*(
            col.ilike(f"%{w}%") for w in CATEGORIES[category] for col in (ScrapedEvent.title, ScrapedEvent.summary)
        )))
    if platform in PLATFORMS:
        stmt = stmt.where(or_(*(ScrapedEvent.source_url.ilike(f"%{h}/%") for h in PLATFORMS[platform])))
    return (await db.execute(stmt.offset(skip).limit(limit))).scalars().all()


@router.post("/sync", response_model=SyncResult)
async def trigger_sync(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_roles(UserRole.admin))
):
    try:
        return await sync_events(db)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Event sync failed: {exc}") from exc


@router.post("/import", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def import_event(
    data: EventImport, db: AsyncSession = Depends(get_db), _: User = Depends(require_roles(UserRole.admin))
):
    """Add one event from a public post link (Facebook, Instagram, LinkedIn or uoh.edu.pk)."""
    url = data.url.strip()
    # Known platforms only, so the server cannot be pointed at internal URLs.
    if not url.startswith("https://") or platform_of(url) == "web":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paste an https link from Facebook, Instagram, LinkedIn or uoh.edu.pk")
    try:
        item = await fetch_preview(url)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not open that link: {exc}") from exc
    if item is None or item["title"].lower() in ("facebook", "instagram", "linkedin", "log in", "login"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That post is private or needs a login. Use a public post link.")
    if platform_of(item["source_url"]) == "web":
        item["source_url"] = url
    result = await db.execute(
        pg_insert(ScrapedEvent).values(**item, scraped_at=datetime.now(timezone.utc))
        .on_conflict_do_nothing(index_elements=["source_url"]).returning(ScrapedEvent.id)
    )
    new_id = result.scalar_one_or_none()
    await db.commit()
    if new_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This event is already listed")
    return await db.get(ScrapedEvent, new_id)
