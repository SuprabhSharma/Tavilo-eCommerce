import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import RoleChecker
from src.db.main import get_session
from src.errors import ProductNotFound

from .schemas import CategoryCreate, CategoryOut, CategoryUpdate
from .service import CategoryService

category_router = APIRouter()
service = CategoryService()

admin_only = Depends(RoleChecker(["admin"]))


# ── Public ────────────────────────────────────────────────────────────────────

@category_router.get("", response_model=List[CategoryOut])
async def list_categories(session: AsyncSession = Depends(get_session)):
    """Return every category (flat list; parent_id links them)."""
    return await service.get_all(session)


@category_router.get("/{slug}", response_model=CategoryOut)
async def get_category(slug: str, session: AsyncSession = Depends(get_session)):
    cat = await service.get_by_slug(slug, session)
    if not cat:
        raise ProductNotFound()
    return cat


# ── Admin CRUD ────────────────────────────────────────────────────────────────

@category_router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED, dependencies=[admin_only])
async def create_category(data: CategoryCreate, session: AsyncSession = Depends(get_session)):
    return await service.create(data, session)


@category_router.patch("/{uid}", response_model=CategoryOut, dependencies=[admin_only])
async def update_category(uid: uuid.UUID, data: CategoryUpdate, session: AsyncSession = Depends(get_session)):
    cat = await service.get_by_id(uid, session)
    if not cat:
        raise ProductNotFound()
    return await service.update(cat, data, session)


@category_router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[admin_only])
async def delete_category(uid: uuid.UUID, session: AsyncSession = Depends(get_session)):
    cat = await service.get_by_id(uid, session)
    if not cat:
        raise ProductNotFound()
    await service.delete(cat, session)
