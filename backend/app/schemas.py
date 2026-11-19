import re
import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator

from app.models import AlertStatus, AlertType, CafeCategory, PostCategory, UserRole

REG_NO_PATTERN = re.compile(r"^[A-Z]\d{2}-\d{3,5}$")  # e.g. F23-0382
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------- Auth / Users ----------------------------- #
class UserBase(BaseModel):
    reg_no: str = Field(..., examples=["F23-0382"])
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    department: str = Field(..., min_length=2, max_length=100)
    semester: int = Field(1, ge=1, le=12)
    section: str = Field("A", min_length=1, max_length=10)

    @field_validator("reg_no")
    @classmethod
    def validate_reg_no(cls, v: str) -> str:
        v = v.strip().upper()
        if not REG_NO_PATTERN.match(v):
            raise ValueError("Registration ID must look like F23-0382")
        return v

    @field_validator("section")
    @classmethod
    def upper_section(cls, v: str) -> str:
        return v.strip().upper()


class UserCreate(UserBase):
    """Public registration. Role is always 'student'; admins assign other roles."""

    password: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def strong_password(self):
        from app.security import password_problem
        problem = password_problem(self.password, self.reg_no, str(self.email).split("@")[0])
        if problem:
            raise ValueError(problem)
        return self


class PasswordChange(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Login with either reg_no or email in `identifier`."""

    identifier: str = Field(..., examples=["F23-0382"])
    password: str


class UserOut(ORMModel):
    id: uuid.UUID
    reg_no: str
    full_name: str
    email: EmailStr
    department: str
    semester: int
    section: str
    role: UserRole
    created_at: datetime


class UserBrief(ORMModel):
    """Embedded author info for alerts, posts, comments, chat."""

    id: uuid.UUID
    reg_no: str
    full_name: str
    department: str


class UserRoleUpdate(BaseModel):
    role: UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenPayload(BaseModel):
    sub: str
    role: UserRole
    exp: int


# ------------------------------ Emergency ------------------------------- #
class SOSCreate(BaseModel):
    alert_type: AlertType
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    location_note: Optional[str] = Field(None, max_length=255)


class AlertStatusUpdate(BaseModel):
    status: AlertStatus


class AlertOut(ORMModel):
    id: uuid.UUID
    alert_type: AlertType
    latitude: float
    longitude: float
    location_note: Optional[str]
    status: AlertStatus
    created_at: datetime
    resolved_at: Optional[datetime]
    user: UserBrief


# ---------------------------- Social Feed ------------------------------- #
class PostCreate(BaseModel):
    """JSON body variant; the router also accepts multipart form with an image file."""

    title: Optional[str] = Field(None, max_length=200)
    content: str = Field(..., min_length=1, max_length=5000)
    category: PostCategory = PostCategory.general


class CommentCreate(BaseModel):
    comment_text: str = Field(..., min_length=1, max_length=2000)
    parent_id: Optional[int] = None  # reply to another comment on the same post


class CommentOut(ORMModel):
    id: int
    post_id: uuid.UUID
    parent_id: Optional[int] = None
    comment_text: str
    created_at: datetime
    user: UserBrief


class PostOut(ORMModel):
    id: uuid.UUID
    title: Optional[str]
    content: str
    category: PostCategory
    image_url: Optional[str]
    likes_count: int
    created_at: datetime
    user: UserBrief
    comments: list[CommentOut] = []
    liked_by_me: bool = False


class LikeResult(BaseModel):
    post_id: uuid.UUID
    liked: bool
    likes_count: int


# ----------------------------- Live Chat -------------------------------- #
class ChatMessageIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)


class ChatMessageOut(BaseModel):
    type: str = "message"
    sender_id: uuid.UUID
    sender_name: str
    reg_no: str
    department: str
    message: str
    timestamp: datetime


# ------------------------------ Timetable ------------------------------- #
class TimetableBase(BaseModel):
    department: str = Field(..., min_length=2, max_length=100)
    semester: int = Field(..., ge=1, le=12)
    section: str = Field(..., min_length=1, max_length=10)
    day_of_week: str
    subject_name: str = Field(..., min_length=1, max_length=150)
    teacher_name: str = Field(..., min_length=1, max_length=120)
    room_no: str = Field(..., min_length=1, max_length=30)
    start_time: time
    end_time: time

    @field_validator("day_of_week")
    @classmethod
    def validate_day(cls, v: str) -> str:
        v = v.strip().capitalize()
        if v not in DAYS:
            raise ValueError(f"day_of_week must be one of {', '.join(DAYS)}")
        return v

    @field_validator("section")
    @classmethod
    def upper_section(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def check_times(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class TimetableCreate(TimetableBase):
    pass


class TimetableUpdate(TimetableBase):
    pass


class TimetableOut(ORMModel, TimetableBase):
    id: int


class CSVUploadResult(BaseModel):
    inserted: int
    errors: list[str] = []


# ------------------------------ Cafeteria ------------------------------- #
class CafeItemBase(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=120)
    category: CafeCategory
    price: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)
    is_available: bool = True


class CafeItemCreate(CafeItemBase):
    pass


class CafeItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=120)
    category: Optional[CafeCategory] = None
    price: Optional[Decimal] = Field(None, gt=0, max_digits=10, decimal_places=2)
    is_available: Optional[bool] = None


class AvailabilityUpdate(BaseModel):
    is_available: bool


class CafeItemOut(ORMModel, CafeItemBase):
    id: int
    image_url: Optional[str] = None
    updated_at: datetime


# ------------------------------- Events --------------------------------- #
class EventOut(ORMModel):
    id: int
    title: str
    summary: Optional[str]
    event_date: Optional[str]
    source_url: str
    image_url: Optional[str] = None
    scraped_at: datetime

    @computed_field
    @property
    def category(self) -> str:
        from app.scraper import categorize
        return categorize(f"{self.title} {self.summary or ''}")

    @computed_field
    @property
    def platform(self) -> str:
        from app.scraper import platform_of
        return platform_of(self.source_url)


class EventImport(BaseModel):
    url: str = Field(..., min_length=8, max_length=1000)


class SyncResult(BaseModel):
    fetched: int
    inserted: int
    source: str  # "live" or "fallback"


class MessageResponse(BaseModel):
    detail: str
