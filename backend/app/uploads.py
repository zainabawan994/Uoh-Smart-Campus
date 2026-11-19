"""Validated application-owned image storage helpers."""
import logging
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import HTTPException, UploadFile, status

from app.config import settings

log = logging.getLogger(__name__)
IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
}


def _detect_image_ext(head: bytes) -> Optional[str]:
    for signature, extension in IMAGE_SIGNATURES.items():
        if head.startswith(signature):
            return extension
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


async def save_image(image: UploadFile, namespace: str) -> str:
    """Validate magic bytes and size, then save under an application namespace."""
    if not namespace.isidentifier():
        raise ValueError("Invalid upload namespace")
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await image.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Image must be under {settings.MAX_UPLOAD_MB} MB")
    extension = _detect_image_ext(data[:16])
    if extension is None:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPG, PNG, GIF or WEBP images are allowed")

    directory = Path(settings.UPLOAD_DIR) / namespace
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    async with aiofiles.open(directory / filename, "wb") as output:
        await output.write(data)
    return f"/uploads/{namespace}/{filename}"


def delete_owned_image(image_url: Optional[str], namespace: str) -> None:
    """Delete only UUID-named images inside the requested application namespace."""
    prefix = f"/uploads/{namespace}/"
    if not image_url or not image_url.startswith(prefix):
        return
    filename = Path(image_url).name
    stem = Path(filename).stem
    try:
        uuid.UUID(hex=stem)
    except ValueError:
        log.warning("Refused to delete an unexpected upload name: %s", image_url)
        return

    directory = (Path(settings.UPLOAD_DIR) / namespace).resolve()
    target = (directory / filename).resolve()
    if target.parent != directory:
        log.warning("Refused upload path outside namespace: %s", image_url)
        return
    try:
        target.unlink(missing_ok=True)
    except OSError:
        log.exception("Could not delete image %s", target)
