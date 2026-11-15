"""Orphan image cleanup script (Phase 5).

Deletes unreferenced files from the product media volume older than 48 hours.
Default mode is --dry-run; pass --apply to delete files.

Usage:
    python -m scripts.cleanup_orphan_images [--dry-run | --apply] [--hours 48]
"""

import argparse
import asyncio
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.main import async_engine
from src.db.models import ProductImage
from src.products.image_storage import PRODUCT_IMAGE_DIR, get_image_filename

SEED_ASSETS_DIR = Path(__file__).resolve().parent.parent / "seed_assets" / "products"


def extract_base_id(filename: str) -> str:
    stem = Path(filename).stem
    if "_" in stem:
        # e.g. "hash_1600" -> "hash", or "seed_001_1_1600" -> "seed_001_1"
        return stem.rsplit("_", 1)[0]
    return stem


async def cleanup_orphans(apply: bool = False, hours: int = 48):
    cutoff_time = time.time() - (hours * 3600)
    session_factory = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)

    print(f"Starting orphan image cleanup (cutoff: older than {hours} hours)...")
    print(f"Mode: {'APPLY (deleting files)' if apply else 'DRY-RUN (no files will be deleted)'}")

    # 1. Collect all active base IDs from DB
    async with session_factory() as session:
        stmt = select(ProductImage.url)
        res = await session.exec(stmt)
        urls = res.all()

    active_bases = set()
    for u in urls:
        fn = get_image_filename(u)
        if fn:
            active_bases.add(extract_base_id(fn))

    # Also protect all committed seed assets
    if SEED_ASSETS_DIR.is_dir():
        for sf in SEED_ASSETS_DIR.glob("*.webp"):
            active_bases.add(extract_base_id(sf.name))

    print(f"Total active image bases referenced in DB / seed: {len(active_bases)}")

    if not PRODUCT_IMAGE_DIR.exists():
        print(f"Media directory {PRODUCT_IMAGE_DIR} does not exist. Nothing to do.")
        return

    scanned_count = 0
    orphan_count = 0
    deleted_count = 0
    total_bytes_freed = 0

    for path in PRODUCT_IMAGE_DIR.glob("*.webp"):
        scanned_count += 1
        stat = path.stat()
        mtime = stat.st_mtime

        # Only consider files older than cutoff
        if mtime >= cutoff_time:
            continue

        base = extract_base_id(path.name)
        if base not in active_bases:
            orphan_count += 1
            size = stat.st_size
            total_bytes_freed += size
            if apply:
                try:
                    path.unlink()
                    deleted_count += 1
                except OSError as e:
                    print(f"Failed to delete {path.name}: {e}")
            else:
                if orphan_count <= 20:
                    print(f"  [ORPHAN] {path.name} ({size / 1024:.1f} KB, modified {time.ctime(mtime)})")

    print("\n" + "=" * 50)
    print("ORPHAN CLEANUP SUMMARY")
    print("=" * 50)
    print(f"Scanned files              : {scanned_count}")
    print(f"Orphan files found (> {hours}h): {orphan_count}")
    print(f"Orphan files deleted       : {deleted_count}")
    print(f"Disk space reclaimable     : {total_bytes_freed / (1024 * 1024):.2f} MB")
    print("=" * 50 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Cleanup orphan product images")
    parser.add_argument("--apply", action="store_true", help="Delete orphan files")
    parser.add_argument("--dry-run", action="store_true", help="Dry run only (default)")
    parser.add_argument("--hours", type=int, default=48, help="Age in hours before file is candidate for deletion (default: 48)")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    asyncio.run(cleanup_orphans(apply=apply, hours=args.hours))


if __name__ == "__main__":
    main()
