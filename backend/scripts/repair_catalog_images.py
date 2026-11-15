"""Catalog image repair script (Phase 3.3).

Idempotent script to clean up picsum placeholder URLs and report missing vendor files.

Usage:
    python -m scripts.repair_catalog_images [--dry-run | --apply]
"""

import argparse
import asyncio
import re
import shutil
from pathlib import Path

from sqlmodel import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.main import async_engine
from src.db.models import Product, ProductImage, User, Vendor
from src.products.image_storage import PRODUCT_IMAGE_DIR, get_image_filename

SEED_ASSETS_DIR = Path(__file__).resolve().parent.parent / "seed_assets" / "products"


def copy_seed_asset_if_needed(filename: str) -> bool:
    """Copy seed asset into PRODUCT_IMAGE_DIR if not already present."""
    PRODUCT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    dst = PRODUCT_IMAGE_DIR / filename
    if dst.is_file():
        return True
    src = SEED_ASSETS_DIR / filename
    if src.is_file():
        shutil.copy2(src, dst)
        return True
    return False


async def repair_images(apply_changes: bool = False):
    session_factory = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)
    fixed_count = 0
    missing_files_count = 0
    untouched_count = 0
    missing_report = []

    async with session_factory() as session:
        # Query all products with their vendor and user
        stmt = (
            select(Product, Vendor, User)
            .join(Vendor, Product.vendor_id == Vendor.uid, isouter=True)
            .join(User, Vendor.user_id == User.uid, isouter=True)
        )
        result = await session.exec(stmt)
        rows = result.all()

        for p_idx, (product, vendor, user) in enumerate(rows):
            # Query images for this product
            img_stmt = select(ProductImage).where(ProductImage.product_id == product.uid).order_by(ProductImage.position)
            img_res = await session.exec(img_stmt)
            images = img_res.all()

            is_seed_account = user is not None and user.email is not None and user.email.endswith("@marketplace.com")
            has_picsum = any("picsum.photos" in (img.url or "") for img in images)

            if has_picsum and is_seed_account:
                # Extract seed index from slug or URL or enumerate position
                idx = p_idx % 60
                match = re.search(r"-(\d+)$", product.slug or "")
                if match:
                    try:
                        idx = int(match.group(1)) % 60
                    except ValueError:
                        pass
                else:
                    for img in images:
                        pm = re.search(r"seed/(\d+)/", img.url or "")
                        if pm:
                            idx = int(pm.group(1)) % 60
                            break

                user_email = user.email if user else "seed"
                print(f"[REPLACE PICSUM] Product #{idx:03d} '{product.title}' (Vendor: {user_email}) -> seed images")

                # Ensure all 3 shots x 4 variants are in PRODUCT_IMAGE_DIR
                for shot in (1, 2, 3):
                    for w in [160, 480, 800, 1600]:
                        fn = f"seed_{idx:03d}_{shot}_{w}.webp"
                        copy_seed_asset_if_needed(fn)

                if apply_changes:
                    # Remove old picsum records
                    for img in images:
                        await session.delete(img)
                    # Add 3 real seed images
                    for shot in (1, 2, 3):
                        canon_url = f"/api/v1/products/images/seed_{idx:03d}_{shot}_1600.webp"
                        session.add(
                            ProductImage(
                                product_id=product.uid,
                                url=canon_url,
                                position=shot - 1,
                                width=1600,
                                height=1600,
                            )
                        )
                fixed_count += 1
            else:
                # Check real uploaded images
                for img in images:
                    url = img.url or ""
                    fn = get_image_filename(url)
                    if fn:
                        path = PRODUCT_IMAGE_DIR / fn
                        if not path.is_file():
                            missing_files_count += 1
                            v_name = vendor.store_name if vendor else "Unknown"
                            u_email = user.email if user else "No email"
                            missing_report.append(
                                f"  • Product: {product.title} (ID: {product.uid})\n"
                                f"    Vendor: {v_name} ({u_email})\n"
                                f"    Missing URL: {url}"
                            )
                        else:
                            untouched_count += 1
                    else:
                        untouched_count += 1

        if apply_changes and fixed_count > 0:
            await session.commit()
            print("\nSuccessfully applied changes to database.")
        else:
            print("\nDry-run complete (no database changes written).")

    print("\n" + "=" * 50)
    print("CATALOG IMAGE REPAIR SUMMARY")
    print("=" * 50)
    print(f"Fixed seed products (picsum -> real images) : {fixed_count}")
    print(f"Untouched valid images                       : {untouched_count}")
    print(f"Missing image files detected on disk        : {missing_files_count}")
    if missing_report:
        print("\nMissing files report (vendor re-upload required):")
        print("\n".join(missing_report))
    print("=" * 50 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Repair catalog images in database")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Perform a dry-run check only")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    asyncio.run(repair_images(apply_changes=apply))


if __name__ == "__main__":
    main()
