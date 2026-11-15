import io
import time
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException, UploadFile
from httpx import ASGITransport, AsyncClient
from PIL import Image

from src import app
from src.products.image_storage import (
    PRODUCT_IMAGE_DIR,
    ImageRejected,
    create_image_access_token,
    get_image_filename,
    process_image,
    save_product_images,
    verify_image_access_token,
)
from src.products.service import ProductService

pytestmark = pytest.mark.no_db


def make_test_image(width=800, height=800, fmt="JPEG", mode="RGB", color=(100, 150, 200), exif=None):
    img = Image.new(mode, (width, height), color)
    buf = io.BytesIO()
    if exif is not None:
        img.save(buf, format=fmt, exif=exif)
    else:
        img.save(buf, format=fmt)
    return buf.getvalue()


def test_exif_orientation_transposition():
    """1. Upload JPEG with EXIF orientation 6 -> stored zoom image is upright."""
    # Create an image that is 600 wide x 1000 high with EXIF orientation 6 (rotated 90 deg)
    img = Image.new("RGB", (600, 1000), (200, 100, 50))
    exif = img.getexif()
    exif[0x0112] = 6  # Orientation 6
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    raw = buf.getvalue()

    result = process_image(raw)
    zoom_bytes = result["variants"]["zoom"]
    with Image.open(io.BytesIO(zoom_bytes)) as zoom_img:
        w, h = zoom_img.size
        # EXIF orientation 6 swaps width and height
        assert w == 1000
        assert h == 600


def test_transparent_png_corner_pixel_is_white():
    """2. Upload transparent PNG -> corner pixel is white (255, 255, 255), not black."""
    img = Image.new("RGBA", (600, 600), (0, 0, 0, 0))  # Fully transparent
    # Draw a non-transparent center
    for x in range(250, 350):
        for y in range(250, 350):
            img.putpixel((x, y), (255, 0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()

    result = process_image(raw)
    zoom_bytes = result["variants"]["zoom"]
    with Image.open(io.BytesIO(zoom_bytes)) as zoom_img:
        corner = zoom_img.getpixel((0, 0))
        assert corner == (255, 255, 255), f"Expected white corner (255, 255, 255), got {corner}"


def test_rejects_small_image():
    """3. Upload 300x300 image -> 400 with 'too small'."""
    raw = make_test_image(width=300, height=300)
    with pytest.raises(ImageRejected, match="too small"):
        process_image(raw)


def test_rejects_non_image_files():
    """4. Upload a text file renamed .jpg, or invalid image bytes -> 400."""
    fake_jpg = b"This is plain text pretending to be a JPG."
    with pytest.raises(ImageRejected):
        process_image(fake_jpg)


@pytest.mark.asyncio
async def test_rejects_oversized_file(tmp_path, monkeypatch):
    """5. Upload 11 MB file -> 413."""
    vendor_id = uuid.uuid4()
    oversized = UploadFile(
        filename="huge.jpg",
        file=io.BytesIO(b"x" * (11 * 1024 * 1024)),
        headers={"content-type": "image/jpeg"},
    )
    with pytest.raises(HTTPException) as exc:
        await save_product_images([oversized], vendor_id)
    assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_valid_image_creates_four_variants_and_deduplicates(tmp_path, monkeypatch):
    """6. Upload valid image -> four .webp files exist; stored URL ends with _1600.webp; re-upload deduplicates."""
    import src.products.storage as storage_mod

    monkeypatch.setattr(storage_mod, "PRODUCT_IMAGE_DIR", tmp_path)
    import src.products.image_storage as img_storage

    monkeypatch.setattr(img_storage, "PRODUCT_IMAGE_DIR", tmp_path)

    vendor_id = uuid.uuid4()
    raw = make_test_image(width=1200, height=800)

    upload1 = UploadFile(
        filename="photo.jpg",
        file=io.BytesIO(raw),
        headers={"content-type": "image/jpeg"},
    )
    res1 = await save_product_images([upload1], vendor_id)
    assert len(res1["images"]) == 1
    url1 = res1["images"][0]
    assert url1.startswith("/api/v1/products/images/")
    assert "_1600.webp?token=" in url1

    # Extract base name
    fn = get_image_filename(url1)
    base = fn.split("_")[0]
    for w in [160, 480, 800, 1600]:
        variant_file = tmp_path / f"{base}_{w}.webp"
        assert variant_file.is_file(), f"Expected variant {variant_file} to exist"

    # Re-upload identical bytes -> must produce the same base hash
    upload2 = UploadFile(
        filename="photo_copy.jpg",
        file=io.BytesIO(raw),
        headers={"content-type": "image/jpeg"},
    )
    res2 = await save_product_images([upload2], vendor_id)
    url2 = res2["images"][0]
    fn2 = get_image_filename(url2)
    assert fn2.split("_")[0] == base


def test_token_vendor_isolation():
    """7. Attach staged image to a product as vendor A -> ok; attach vendor A's token as vendor B -> 403."""
    vendor_a = uuid.uuid4()
    vendor_b = uuid.uuid4()
    filename = "abcdef1234567890abcdef1234567890_1600.webp"

    token_a = create_image_access_token(filename, vendor_a)

    # Vendor A can verify
    assert verify_image_access_token(token_a, filename, vendor_a) is True

    # Vendor B cannot verify Vendor A's token
    assert verify_image_access_token(token_a, filename, vendor_b) is False


def test_token_expiration():
    """8. Token older than 24h -> 403."""
    vendor_id = uuid.uuid4()
    filename = "test_image_1600.webp"

    token = create_image_access_token(filename, vendor_id)

    # Valid immediately
    assert verify_image_access_token(token, filename, vendor_id) is True

    # Expired when max_age is 0 or simulated older than 24h
    with patch("src.products.image_storage.STAGED_IMAGE_TOKEN_MAX_AGE", -1):
        assert verify_image_access_token(token, filename, vendor_id) is False


@pytest.mark.asyncio
async def test_path_traversal_returns_404():
    """9. GET /api/v1/products/images/../../etc/passwd -> 404."""
    assert get_image_filename("/api/v1/products/images/../../etc/passwd") is None
    assert get_image_filename("/api/v1/products/images/..%2f..%2fetc%2fpasswd") is None

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        res = await client.get("/api/v1/products/images/../../etc/passwd")
        assert res.status_code == 404
