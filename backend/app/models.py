import enum
import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    security = "security"
    cafe_manager = "cafe_manager"
    admin = "admin"


class AlertType(str, enum.Enum):
    medical = "medical"
    security = "security"
    fire = "fire"
    harassment = "harassment"


class AlertStatus(str, enum.Enum):
    active = "active"
    dispatched = "dispatched"
    resolved = "resolved"


class PostCategory(str, enum.Enum):
    general = "general"
    lost_and_found = "lost_and_found"
    study_help = "study_help"
    announcement = "announcement"


class CafeCategory(str, enum.Enum):
    fast_food = "fast_food"
    desi = "desi"
    snacks = "snacks"
    beverages = "beverages"


def _enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """Native PostgreSQL ENUM that stores the enum *values* (lowercase strings)."""
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reg_no: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    section: Mapped[str] = mapped_column(String(10), nullable=False, default="A")
    role: Mapped[UserRole] = mapped_column(
        _enum(UserRole, "user_role"), nullable=False, default=UserRole.student, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # passive_deletes lets PostgreSQL's ON DELETE CASCADE remove children when a user is deleted
    alerts: Mapped[list["EmergencyAlert"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    posts: Mapped[list["CampusPost"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    comments: Mapped[list["PostComment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class EmergencyAlert(Base):
    __tablename__ = "emergency_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(_enum(AlertType, "alert_type"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[AlertStatus] = mapped_column(
        _enum(AlertStatus, "alert_status"), nullable=False, default=AlertStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="alerts")

    __table_args__ = (Index("ix_emergency_alerts_status_created", "status", "created_at"),)


class CampusPost(Base):
    __tablename__ = "campus_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[PostCategory] = mapped_column(
        _enum(PostCategory, "post_category"), nullable=False, default=PostCategory.general, index=True
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    likes_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["PostComment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", passive_deletes=True,
        order_by="PostComment.created_at",
    )
    likes: Mapped[list["PostLike"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", passive_deletes=True
    )


class PostComment(Base):
    __tablename__ = "post_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campus_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    post: Mapped["CampusPost"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship(back_populates="comments")


class PostLike(Base):
    """One row per (post, user) so a student can like a post only once.
    campus_posts.likes_count is kept as a denormalized counter."""

    __tablename__ = "post_likes"

    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campus_posts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    post: Mapped["CampusPost"] = relationship(back_populates="likes")


class Timetable(Base):
    __tablename__ = "timetables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(10), nullable=False)
    day_of_week: Mapped[str] = mapped_column(String(10), nullable=False)
    subject_name: Mapped[str] = mapped_column(String(150), nullable=False)
    teacher_name: Mapped[str] = mapped_column(String(120), nullable=False)
    room_no: Mapped[str] = mapped_column(String(30), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    __table_args__ = (
        Index("ix_timetables_class_day", "department", "semester", "section", "day_of_week"),
    )


class CafeMenuItem(Base):
    __tablename__ = "cafe_menu"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[CafeCategory] = mapped_column(
        _enum(CafeCategory, "cafe_category"), nullable=False, index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_available: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ScrapedEvent(Base):
    __tablename__ = "scraped_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_date: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_url: Mapped[str] = mapped_column(String(1000), unique=True, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class LoginFailure(Base):
    """Failed sign-in attempts, kept in the database so limits survive restarts and multiple workers."""

    __tablename__ = "login_failures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_login_failures_key_created", "key", "created_at"),)
