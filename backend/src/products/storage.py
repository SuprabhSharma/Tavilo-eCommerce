from pathlib import Path
from typing import Protocol
import os
from src.config import BASE_DIR

PRODUCT_IMAGE_DIR = BASE_DIR / "uploads" / "products"


class ImageStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str = "image/webp") -> None:
        ...

    async def delete_prefix(self, prefix: str) -> None:
        ...

    def public_url(self, key: str) -> str:
        ...


class LocalStorage:
    def __init__(self, base_dir: Path = PRODUCT_IMAGE_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def put(self, key: str, data: bytes, content_type: str = "image/webp") -> None:
        target = self.base_dir / key
        target.write_bytes(data)

    async def delete_prefix(self, prefix: str) -> None:
        for p in self.base_dir.glob(f"{prefix}*"):
            if p.is_file():
                try:
                    p.unlink()
                except OSError:
                    pass

    def public_url(self, key: str) -> str:
        return f"/api/v1/products/images/{key}"


class S3Storage:
    def __init__(self, *args, **kwargs):
        raise NotImplementedError("S3/R2 storage is configured in Phase 5")

    async def put(self, key: str, data: bytes, content_type: str = "image/webp") -> None:
        raise NotImplementedError

    async def delete_prefix(self, prefix: str) -> None:
        raise NotImplementedError

    def public_url(self, key: str) -> str:
        raise NotImplementedError


def get_image_storage() -> ImageStorage:
    storage_type = os.getenv("IMAGE_STORAGE", "local").lower()
    if storage_type == "s3":
        return S3Storage()
    return LocalStorage(PRODUCT_IMAGE_DIR)
