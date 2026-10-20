import io
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import HTTPException, UploadFile, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from PIL import Image, UnidentifiedImageError

from src.config import BASE_DIR
from src.config import Config

PRODUCT_IMAGE_DIR = BASE_DIR / "uploads" / "products"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PRODUCT_IMAGES = 10
MAX_IMAGE_DIMENSION = 1600
IMAGE_URL_PREFIX = "/api/v1/products/images/"
STAGED_IMAGE_TOKEN_MAX_AGE = 30 * 60
_image_token_serializer = URLSafeTimedSerializer(Config.JWT_SECRET, salt="product-image-access")


def _filename_from_url(url: str) -> str | None:
    parsed = urlsplit(url)
    path = parsed.path.rstrip("/")
    if path.startswith(IMAGE_URL_PREFIX):
        filename = path.removeprefix(IMAGE_URL_PREFIX)
    elif path.startswith("/media/products/"):
        filename = path.removeprefix("/media/products/")
    else:
        return None
    if not filename or Path(filename).name != filename or Path(filename).suffix.lower() != ".webp":
        return None
    return filename


def create_image_access_token(filename: str, vendor_id: uuid.UUID) -> str:
    return _image_token_serializer.dumps(
        {"purpose": "product-image", "filename": filename, "vendor_id": str(vendor_id)}
    )


def verify_image_access_token(token: str | None, filename: str, vendor_id: uuid.UUID | None = None) -> bool:
    if not token:
        return False
    try:
        payload = _image_token_serializer.loads(token, max_age=STAGED_IMAGE_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return False
    if payload.get("purpose") != "product-image" or payload.get("filename") != filename:
        return False
    return vendor_id is None or payload.get("vendor_id") == str(vendor_id)


def get_image_filename(url: str) -> str | None:
    return _filename_from_url(url)


def canonical_image_url(filename: str) -> str:
    return f"{IMAGE_URL_PREFIX}{filename}"


def staged_image_url(filename: str, vendor_id: uuid.UUID) -> str:
    token = create_image_access_token(filename, vendor_id)
    return f"{canonical_image_url(filename)}?token={token}"


async def save_product_images(files: list[UploadFile], vendor_id: uuid.UUID) -> list[str]:
    if len(files) > MAX_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can upload at most {MAX_PRODUCT_IMAGES} images.",
        )

    PRODUCT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    try:
        for file in files:
            if not file.content_type or not file.content_type.startswith("image/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{file.filename or 'File'} is not a supported image.",
                )

            contents = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Each image must be 10 MB or smaller.",
                )

            try:
                with Image.open(io.BytesIO(contents)) as source:
                    image = source.convert("RGB")
                    image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
                    image_uid = uuid.uuid4().hex
                    output_path = PRODUCT_IMAGE_DIR / f"{image_uid}.webp"
                    image.save(output_path, "WEBP", quality=82, method=6, optimize=True)
            except (UnidentifiedImageError, OSError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{file.filename or 'File'} is not a valid image.",
                ) from exc

            urls.append(staged_image_url(output_path.name, vendor_id))
    except Exception:
        for url in urls:
            delete_product_image(url)
        raise
    finally:
        await file.close()

    return urls


def delete_product_image(url: str) -> None:
    filename = _filename_from_url(url)
    if not filename:
        return
    path = PRODUCT_IMAGE_DIR / filename
    if path.parent == PRODUCT_IMAGE_DIR and path.exists():
        path.unlink()
