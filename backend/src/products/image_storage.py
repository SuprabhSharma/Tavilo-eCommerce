import hashlib
import io
from pathlib import Path
from urllib.parse import urlsplit
import uuid

from fastapi import HTTPException, UploadFile, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from src.config import Config
from src.products.storage import PRODUCT_IMAGE_DIR, get_image_storage

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MiB
MIN_SIDE_PX = 500
RECOMMENDED_SIDE_PX = 1000
Image.MAX_IMAGE_PIXELS = 50_000_000
VARIANTS = (("thumb", 160, 78), ("card", 480, 80), ("detail", 800, 82), ("zoom", 1600, 84))
MAX_PRODUCT_IMAGES = 10
IMAGE_URL_PREFIX = "/api/v1/products/images/"
STAGED_IMAGE_TOKEN_MAX_AGE = 24 * 60 * 60  # 24 hours (fixes RC5)
_image_token_serializer = URLSafeTimedSerializer(Config.JWT_SECRET, salt="product-image-access")


class ImageRejected(ValueError):
    pass


def process_image(raw: bytes) -> dict:
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise ImageRejected("Only JPG, PNG or WebP images are allowed.")
            probe.verify()                         # structural check
        with Image.open(io.BytesIO(raw)) as src:   # re-open: verify() consumes the file
            src = ImageOps.exif_transpose(src)     # fix phone rotation
            if min(src.size) < MIN_SIDE_PX:
                raise ImageRejected(f"Image is too small. Minimum {MIN_SIDE_PX}px on the shorter side.")
            if src.mode in ("RGBA", "LA") or (src.mode == "P" and "transparency" in src.info):
                rgba = src.convert("RGBA")
                bg = Image.new("RGB", rgba.size, (255, 255, 255))   # white, not black
                bg.paste(rgba, mask=rgba.getchannel("A"))
                base = bg
            else:
                base = src.convert("RGB")
            out: dict[str, bytes | tuple[int, int]] = {}
            for name, side, quality in VARIANTS:
                img = base.copy()
                img.thumbnail((side, side), Image.Resampling.LANCZOS)   # never upscales
                buf = io.BytesIO()
                img.save(buf, "WEBP", quality=quality, method=6)         # no EXIF/ICC copied
                out[name] = buf.getvalue()
                if name == "zoom":
                    out["_size"] = img.size
    except ImageRejected:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageRejected("This file is not a valid image.") from exc
    base_id = hashlib.sha256(out["zoom"]).hexdigest()[:32]
    return {"base": base_id, "variants": out}


def _filename_from_url(url: str) -> str | None:
    if not url:
        return None
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
    if ".." in filename or "/" in filename or "\\" in filename:
        return None
    return filename


def get_image_filename(url: str) -> str | None:
    return _filename_from_url(url)


def is_local_product_image_available(url: str) -> bool:
    filename = _filename_from_url(url)
    if not filename:
        return True
    path = PRODUCT_IMAGE_DIR / filename
    try:
        return path.is_file()
    except OSError:
        return False


def canonical_image_url(filename: str) -> str:
    return f"{IMAGE_URL_PREFIX}{filename}"


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
    if payload.get("purpose") != "product-image":
        return False
    token_fn = payload.get("filename")
    if token_fn != filename:
        token_base = Path(token_fn).stem.rsplit("_", 1)[0] if token_fn else None
        file_base = Path(filename).stem.rsplit("_", 1)[0]
        if token_base != file_base:
            return False
    return vendor_id is None or payload.get("vendor_id") == str(vendor_id)


def staged_image_url(filename: str, vendor_id: uuid.UUID) -> str:
    token = create_image_access_token(filename, vendor_id)
    return f"{canonical_image_url(filename)}?token={token}"


async def save_product_images(files: list[UploadFile], vendor_id: uuid.UUID) -> dict:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided.",
        )
    if len(files) > MAX_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can upload at most {MAX_PRODUCT_IMAGES} images.",
        )

    storage = get_image_storage()
    urls: list[str] = []
    meta: list[dict] = []

    for file in files:
        try:
            contents = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Each image must be 10 MB or smaller.",
                )

            try:
                processed = await run_in_threadpool(process_image, contents)
            except ImageRejected as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                )

            base_id = processed["base"]
            variants = processed["variants"]
            for name, side, _ in VARIANTS:
                key = f"{base_id}_{side}.webp"
                await storage.put(key, variants[name])

            zoom_key = f"{base_id}_1600.webp"
            staged_url = staged_image_url(zoom_key, vendor_id)
            urls.append(staged_url)

            width, height = variants["_size"]
            warning = (
                "Low resolution – 1000px+ recommended"
                if min(width, height) < RECOMMENDED_SIDE_PX
                else None
            )
            meta.append({
                "url": staged_url,
                "width": width,
                "height": height,
                "warning": warning,
            })
        finally:
            await file.close()

    return {"images": urls, "meta": meta}


def delete_product_image(url: str) -> None:
    filename = _filename_from_url(url)
    if not filename:
        return
    stem = Path(filename).stem
    if "_" in stem:
        base_prefix = stem.rsplit("_", 1)[0]
        for p in PRODUCT_IMAGE_DIR.glob(f"{base_prefix}_*.webp"):
            try:
                p.unlink()
            except OSError:
                pass
    path = PRODUCT_IMAGE_DIR / filename
    if path.parent == PRODUCT_IMAGE_DIR and path.exists():
        try:
            path.unlink()
        except OSError:
            pass
