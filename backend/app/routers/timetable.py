"""Class timetables: student views, admin form entry and CSV bulk upload."""
import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Timetable, User, UserRole
from app.schemas import DAYS, CSVUploadResult, MessageResponse, TimetableCreate, TimetableOut, TimetableUpdate

router = APIRouter(prefix="/api/timetable", tags=["timetable"])
admin_only = require_roles(UserRole.admin)

CSV_COLUMNS = [
    "department", "semester", "section", "day_of_week",
    "subject_name", "teacher_name", "room_no", "start_time", "end_time",
]
MAX_CSV_BYTES = 1024 * 1024


def _normalize_day(day: Optional[str]) -> Optional[str]:
    if not day:
        return None
    day = day.strip().capitalize()
    if day not in DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"day must be one of {', '.join(DAYS)}")
    return day


@router.get("", response_model=list[TimetableOut])
async def get_timetable(
    department: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=12),
    section: Optional[str] = None,
    day: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Without filters, returns the logged-in student's own class schedule."""
    if department is None and semester is None and section is None:
        department, semester, section = user.department, user.semester, user.section

    stmt = select(Timetable)
    if department:
        stmt = stmt.where(Timetable.department == department)
    if semester:
        stmt = stmt.where(Timetable.semester == semester)
    if section:
        stmt = stmt.where(Timetable.section == section.strip().upper())
    day = _normalize_day(day)
    if day:
        stmt = stmt.where(Timetable.day_of_week == day)
    rows = (await db.execute(stmt.order_by(Timetable.start_time))).scalars().all()
    # Order by weekday, then start time.
    return sorted(rows, key=lambda r: (DAYS.index(r.day_of_week), r.start_time))


@router.get("/options")
async def class_options(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Distinct classes for the filter dropdowns."""
    rows = (
        await db.execute(
            select(Timetable.department, Timetable.semester, Timetable.section)
            .distinct()
            .order_by(Timetable.department, Timetable.semester, Timetable.section)
        )
    ).all()
    return [{"department": d, "semester": s, "section": sec} for d, s, sec in rows]


@router.post("", response_model=TimetableOut, status_code=status.HTTP_201_CREATED)
async def create_entry(data: TimetableCreate, db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)):
    entry = Timetable(**data.model_dump())
    db.add(entry)
    await db.flush()
    return entry


@router.put("/{entry_id}", response_model=TimetableOut)
async def update_entry(
    entry_id: int, data: TimetableUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)
):
    entry = await db.get(Timetable, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable entry not found")
    for key, value in data.model_dump().items():
        setattr(entry, key, value)
    await db.flush()
    return entry


@router.delete("/{entry_id}", response_model=MessageResponse)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)):
    entry = await db.get(Timetable, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable entry not found")
    await db.delete(entry)
    return MessageResponse(detail="Entry deleted")


@router.post("/upload-csv", response_model=CSVUploadResult)
async def upload_csv(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)
):
    """CSV header: department,semester,section,day_of_week,subject_name,teacher_name,room_no,start_time,end_time
    Times use 24-hour HH:MM. Valid rows are inserted; invalid rows are reported and skipped."""
    raw = await file.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CSV must be under 1 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in CSV_COLUMNS if c not in headers]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing columns: {', '.join(missing)}")

    entries, errors = [], []
    for line_no, row in enumerate(reader, start=2):  # line 1 is the header
        clean = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        try:
            entries.append(Timetable(**TimetableCreate.model_validate(clean).model_dump()))
        except ValidationError as exc:
            reasons = "; ".join(e["msg"] for e in exc.errors())
            errors.append(f"Line {line_no}: {reasons}")

    db.add_all(entries)
    await db.flush()
    return CSVUploadResult(inserted=len(entries), errors=errors[:50])
