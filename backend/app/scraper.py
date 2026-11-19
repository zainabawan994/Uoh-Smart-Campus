"""Scraper for news, events, workshops and tenders on https://www.uoh.edu.pk.

The site's HTML layout is not documented and can change, so the parser is heuristic:
it collects links whose text or URL mentions news/event/tender/workshop-type keywords,
follows a few listing pages one level deep, and extracts a date and summary from the
surrounding markup. If the site is unreachable or yields nothing, fallback sample
entries are used so the Events page is never empty.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ScrapedEvent

log = logging.getLogger(__name__)

try:  # lxml is faster and more forgiving; fall back to the stdlib parser if missing
    import lxml  # noqa: F401

    PARSER = "lxml"
except ImportError:
    PARSER = "html.parser"

# Ordered: the first matching category wins. Keys are what the Events page filters on.
CATEGORIES: dict[str, tuple[str, ...]] = {
    "workshop": ("workshop", "training", "bootcamp", "hands-on", "masterclass", "course"),
    "seminar": ("seminar", "conference", "webinar", "symposium", "talk", "lecture", "session", "panel"),
    "sports": ("sports", "cricket", "football", "badminton", "athletic", "tournament", "gala", "marathon"),
    "competition": ("competition", "hackathon", "contest", "olympiad", "challenge", "quiz", "debate"),
    "cultural": ("cultural", "festival", "fest", "mushaira", "exhibition", "expo", "trip", "dinner",
                 "celebration", "ceremony", "convocation"),
    "career": ("job", "internship", "career", "recruitment", "hiring", "scholarship", "fellowship", "placement"),
    "admissions": ("admission", "enrol", "merit list", "entry test"),
    "tender": ("tender", "procurement", "bids"),
}
KEYWORDS = ("news", "event", "notification", "announcement", "registration", "register") + tuple(
    k for words in CATEGORIES.values() for k in words
)
PLATFORMS = {
    "facebook": ("facebook.com", "fb.com", "fb.me", "fb.watch"),
    "instagram": ("instagram.com",),
    "linkedin": ("linkedin.com", "lnkd.in"),
    "uoh": ("uoh.edu.pk",),
}

LISTING_HINTS = ("news", "event", "tender", "notification", "announcement")
SKIP_EXT = (".jpg", ".jpeg", ".png", ".gif", ".zip", ".doc", ".docx", ".xls", ".xlsx")
MAX_LISTING_PAGES = 4
MAX_EVENTS = 60
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) UoH-SmartCampus/1.0 (+student project)",
    "Accept": "text/html,application/xhtml+xml",
}

MONTHS = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
DATE_PATTERNS = [
    re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+{MONTHS},?\s+\d{{4}}\b", re.I),
    re.compile(rf"\b{MONTHS}\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b", re.I),
    re.compile(r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
]

FALLBACK_EVENTS: list[dict[str, Any]] = [
    {
        "title": "Annual Convocation Ceremony – University of Haripur",
        "summary": "Degrees and gold medals will be awarded to graduates of all faculties at the main campus auditorium.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-convocation",
    },
    {
        "title": "Workshop on Research Methodology and Academic Writing",
        "summary": "A two-day ORIC workshop for MS/PhD scholars covering literature review, citation tools and publishing.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-research-workshop",
    },
    {
        "title": "Tender Notice: Procurement of IT Equipment for Computer Labs",
        "summary": "Sealed bids are invited from registered firms for the supply of desktop computers and networking equipment.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-it-tender",
    },
    {
        "title": "Spring Admissions Open – BS, MS and PhD Programs",
        "summary": "Online applications are open for undergraduate and postgraduate programs. Check the admissions portal for deadlines.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-admissions",
    },
    {
        "title": "Seminar on Climate Change and Forest Conservation in Hazara",
        "summary": "Department of Forestry & Wildlife Management hosts experts to discuss reforestation and biodiversity.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-climate-seminar",
    },
    {
        "title": "Inter-Departmental Sports Gala",
        "summary": "Cricket, football, badminton and athletics competitions between departments. Registration at the sports office.",
        "event_date": "Sample entry",
        "source_url": "https://www.uoh.edu.pk/#sample-sports-gala",
    },
]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _find_date(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)
    return None


def _same_site(url: str, base_host: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host == base_host or host.endswith("." + base_host.removeprefix("www."))


def _has_keyword(*values: str) -> bool:
    blob = " ".join(values).lower()
    return any(k in blob for k in KEYWORDS)


def categorize(text: str) -> str:
    blob = text.lower()
    for category, words in CATEGORIES.items():
        if any(w in blob for w in words):
            return category
    return "news"


def _host_matches(url: str, hosts: tuple[str, ...]) -> bool:
    host = urlparse(url).netloc.lower().split(":")[0]
    return any(host == h or host.endswith("." + h) for h in hosts)


def platform_of(url: str) -> str:
    for platform, hosts in PLATFORMS.items():
        if _host_matches(url, hosts):
            return platform
    return "web"


def parse_preview(html: str, page_url: str) -> dict[str, Any] | None:
    """Build one event from a page's Open Graph tags (works for public FB/IG/LinkedIn posts)."""
    soup = BeautifulSoup(html, PARSER)

    def meta(*names: str) -> str:
        for name in names:
            tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
            if tag and tag.get("content"):
                return _clean(tag["content"])
        return ""

    title = meta("og:title", "twitter:title") or _clean(soup.title.get_text() if soup.title else "")
    summary = meta("og:description", "twitter:description", "description")
    if not title:
        return None
    image = meta("og:image", "twitter:image")
    return {
        "title": title[:500],
        "summary": summary[:1000] or None,
        "event_date": _find_date(f"{title} {summary}"),
        "source_url": (meta("og:url") or page_url)[:1000],
        "image_url": image[:1000] if image.startswith("http") else None,
    }


async def fetch_preview(url: str) -> dict[str, Any] | None:
    headers = HEADERS  # identify honestly; private or login-walled posts are not imported
    async with httpx.AsyncClient(headers=headers, timeout=20, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    return parse_preview(resp.text, str(resp.url))


async def fetch_source_events(url: str) -> list[dict[str, Any]]:
    """Events from one configured page: event-like links on it, else the page's own preview."""
    headers = HEADERS  # identify honestly; private or login-walled posts are not imported
    async with httpx.AsyncClient(headers=headers, timeout=20, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    items = parse_items(resp.text, str(resp.url), urlparse(str(resp.url)).netloc.lower())[0]
    if not items:
        preview = parse_preview(resp.text, str(resp.url))
        if preview and _has_keyword(preview["title"], preview["summary"] or ""):
            items = [preview]
    return items


def parse_items(html: str, page_url: str, base_host: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Return (event items, candidate listing-page URLs) from one HTML page."""
    soup = BeautifulSoup(html, PARSER)
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    items: list[dict[str, Any]] = []
    listings: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        url = urljoin(page_url, href).split("#")[0]
        if not url.startswith("http") or url.lower().endswith(SKIP_EXT):
            continue
        title = _clean(a.get_text(" ")) or _clean(a.get("title", ""))
        path = urlparse(url).path.lower()

        # Short nav links such as "News" or "Events" point to listing pages.
        if len(title) < 25:
            if _same_site(url, base_host) and any(h in (title.lower() + path) for h in LISTING_HINTS):
                listings.append(url)
            continue
        if not _has_keyword(title, path):
            continue

        container = a.find_parent(["li", "article", "tr", "div", "p"]) or a
        context = _clean(container.get_text(" "))
        summary = _clean(context.replace(title, "", 1))[:400] or None
        items.append({
            "title": title[:500],
            "summary": summary,
            "event_date": _find_date(context),
            "source_url": url[:1000],
        })
    return items, listings


async def fetch_uoh_events(base_url: str | None = None) -> tuple[list[dict[str, Any]], str]:
    """Scrape the site. Returns (items, source) where source is 'live' or 'fallback'."""
    base_url = (base_url or settings.UOH_BASE_URL).rstrip("/")
    base_host = urlparse(base_url).netloc.lower()
    found: dict[str, dict[str, Any]] = {}

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            resp = await client.get(base_url)
            resp.raise_for_status()
            items, listings = parse_items(resp.text, str(resp.url), base_host)
            for item in items:
                found.setdefault(item["source_url"], item)

            for listing_url in list(dict.fromkeys(listings))[:MAX_LISTING_PAGES]:
                try:
                    page = await client.get(listing_url)
                    page.raise_for_status()
                except httpx.HTTPError as exc:
                    log.info("Skipping listing page %s: %s", listing_url, exc)
                    continue
                for item in parse_items(page.text, str(page.url), base_host)[0]:
                    found.setdefault(item["source_url"], item)
    except httpx.HTTPError as exc:
        log.warning("UoH website unreachable (%s: %s); using fallback events", type(exc).__name__, exc)
        return list(FALLBACK_EVENTS), "fallback"
    except Exception:  # malformed HTML or unexpected parser failure
        log.exception("UoH scraper failed; using fallback events")
        return list(FALLBACK_EVENTS), "fallback"

    if not found:
        log.warning("No events found on %s; using fallback events", base_url)
        return list(FALLBACK_EVENTS), "fallback"
    return list(found.values())[:MAX_EVENTS], "live"


async def sync_events(db: AsyncSession) -> dict[str, Any]:
    """Scrape and insert new events, skipping any source_url already stored."""
    items, source = await fetch_uoh_events()
    for url in (u.strip() for u in settings.EVENT_SOURCES.split(",")):
        if not url:
            continue
        try:
            extra = await fetch_source_events(url)
        except Exception as exc:  # one blocked page (login wall, rate limit) must not stop the sync
            log.info("Event source %s skipped: %s", url, exc)
            continue
        items.extend(extra[:20])
        if extra and source == "fallback":
            source = "live"
    inserted = 0
    now = datetime.now(timezone.utc)
    for item in items:
        result = await db.execute(
            pg_insert(ScrapedEvent)
            .values(**item, scraped_at=now)
            .on_conflict_do_nothing(index_elements=["source_url"])
            .returning(ScrapedEvent.id)
        )
        if result.scalar_one_or_none() is not None:
            inserted += 1
    if source == "live":
        # Real data is available, so drop placeholder entries from earlier offline syncs.
        await db.execute(delete(ScrapedEvent).where(ScrapedEvent.source_url.contains("#sample-")))
    await db.commit()
    log.info("Event sync: fetched=%d inserted=%d source=%s", len(items), inserted, source)
    return {"fetched": len(items), "inserted": inserted, "source": source}
