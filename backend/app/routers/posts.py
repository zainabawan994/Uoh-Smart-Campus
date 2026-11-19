"""Campus social feed: posts with image upload, likes and nested comments."""
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import CampusPost, PostCategory, PostComment, PostLike, User, UserRole
from app.schemas import CommentCreate, CommentOut, LikeResult, MessageResponse, PostOut

router = APIRouter(prefix="/api/posts", tags=["social feed"])

# Detect the real file type from its first bytes rather than trusting the client.
IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
}


def _detect_image_ext(head: bytes) -> Optional[str]:
    for sig, ext in IMAGE_SIGNATURES.items():
        if head.startswith(sig):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


async def _save_image(image: UploadFile) -> str:
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await image.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be under {settings.MAX_UPLOAD_MB} MB")
    ext = _detect_image_ext(data[:16])
    if ext is None:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPG, PNG, GIF or WEBP images are allowed")
    filename = f"{uuid.uuid4().hex}{ext}"
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(upload_dir / filename, "wb") as f:
        await f.write(data)
    return f"/uploads/{filename}"


def _delete_image(image_url: Optional[str]) -> None:
    if image_url and image_url.startswith("/uploads/"):
        path = Path(settings.UPLOAD_DIR) / Path(image_url).name
        path.unlink(missing_ok=True)


def _post_query():
    return select(CampusPost).options(
        selectinload(CampusPost.user),
        selectinload(CampusPost.comments).selectinload(PostComment.user),
    )


async def _to_out(db: AsyncSession, posts: list[CampusPost], user: User) -> list[PostOut]:
    if not posts:
        return []
    liked = await db.execute(
        select(PostLike.post_id).where(
            PostLike.user_id == user.id, PostLike.post_id.in_([p.id for p in posts])
        )
    )
    liked_ids = set(liked.scalars().all())
    out = []
    for p in posts:
        item = PostOut.model_validate(p)
        item.liked_by_me = p.id in liked_ids
        out.append(item)
    return out


@router.get("", response_model=list[PostOut])
async def list_posts(
    category: Optional[PostCategory] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = _post_query().order_by(CampusPost.created_at.desc()).offset(skip).limit(limit)
    if category:
        stmt = stmt.where(CampusPost.category == category)
    posts = (await db.execute(stmt)).scalars().all()
    return await _to_out(db, list(posts), user)


@router.post("", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    content: str = Form(..., min_length=1, max_length=5000),
    title: Optional[str] = Form(None, max_length=200),
    category: PostCategory = Form(PostCategory.general),
    image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if category == PostCategory.announcement and user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can post announcements")

    image_url = await _save_image(image) if image is not None and image.filename else None
    post = CampusPost(
        user_id=user.id,
        title=(title or "").strip() or None,
        content=content.strip(),
        category=category,
        image_url=image_url,
    )
    try:
        db.add(post)
        await db.flush()
        result = await db.execute(
            _post_query().where(CampusPost.id == post.id).execution_options(populate_existing=True)
        )
        out = (await _to_out(db, [result.scalar_one()], user))[0]
        await db.commit()
        return out
    except Exception:
        await db.rollback()
        _delete_image(image_url)
        raise


@router.delete("/{post_id:uuid}", response_model=MessageResponse)
async def delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = await db.get(CampusPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    if post.user_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own posts")
    image_url = post.image_url
    await db.delete(post)
    await db.commit()
    _delete_image(image_url)
    return MessageResponse(detail="Post deleted")


@router.post("/{post_id:uuid}/like", response_model=LikeResult)
async def toggle_like(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = await db.get(CampusPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")

    removed = await db.execute(
        delete(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == user.id)
    )
    if removed.rowcount:
        liked, delta = False, -1
    else:
        # ON CONFLICT DO NOTHING covers two simultaneous "like" clicks from the same user.
        inserted = await db.execute(
            pg_insert(PostLike)
            .values(post_id=post_id, user_id=user.id)
            .on_conflict_do_nothing()
            .returning(PostLike.post_id)
        )
        liked, delta = True, (1 if inserted.scalar_one_or_none() else 0)

    # Atomic counter update so concurrent likes don't overwrite each other.
    new_count = await db.execute(
        update(CampusPost)
        .where(CampusPost.id == post_id)
        .values(likes_count=CampusPost.likes_count + delta)
        .returning(CampusPost.likes_count)
    )
    return LikeResult(post_id=post_id, liked=liked, likes_count=max(new_count.scalar_one(), 0))


@router.post("/{post_id:uuid}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    post_id: uuid.UUID,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if await db.get(CampusPost, post_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    if data.parent_id is not None:
        parent = await db.get(PostComment, data.parent_id)
        if parent is None or parent.post_id != post_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent comment does not belong to this post")

    comment = PostComment(
        post_id=post_id, user_id=user.id, parent_id=data.parent_id, comment_text=data.comment_text.strip()
    )
    db.add(comment)
    await db.flush()
    result = await db.execute(
        select(PostComment)
        .options(selectinload(PostComment.user))
        .where(PostComment.id == comment.id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


@router.delete("/comments/{comment_id}", response_model=MessageResponse)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await db.get(PostComment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if comment.user_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own comments")
    await db.delete(comment)  # replies are removed by ON DELETE CASCADE
    return MessageResponse(detail="Comment deleted")
