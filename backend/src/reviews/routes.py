import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from src.auth.dependencies import get_verified_user
from src.db.main import get_session
from src.db.models import Product, Review, User
from src.errors import ProductNotFound

from .schemas import ReviewCreateModel, ReviewOut, ReviewStatusOut
from .service import ReviewService

product_review_router = APIRouter()
service = ReviewService()


# ── Product-scoped reviews ────────────────────────────────────────────────────

@product_review_router.get("/products/{slug}/reviews", response_model=list[ReviewOut])
async def get_product_reviews(
    slug: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    p_result = await session.exec(select(Product).where(Product.slug == slug))
    product = p_result.first()
    if not product:
        raise ProductNotFound()
    result = await session.exec(
        select(Review)
        .where(
            Review.product_id == product.uid,
            Review.verified_purchase.is_(True),
        )
        .order_by(Review.created_at.desc(), Review.uid.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.all()


@product_review_router.get("/products/{slug}/review-status", response_model=ReviewStatusOut)
async def get_product_review_status(
    slug: str,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    p_result = await session.exec(select(Product).where(Product.slug == slug))
    product = p_result.first()
    if not product:
        raise ProductNotFound()
    return await service.get_review_status(current_user.email, product.uid, session)


@product_review_router.post("/products/{product_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def add_product_review(
    product_id: uuid.UUID,
    data: ReviewCreateModel,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.add_review_to_product(current_user.email, product_id, data, session)


@product_review_router.put("/products/{product_id}/reviews/{review_id}", response_model=ReviewOut)
async def update_product_review(
    product_id: uuid.UUID,
    review_id: uuid.UUID,
    data: ReviewCreateModel,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    return await service.update_product_review(
        current_user.email, product_id, review_id, data, session
    )


@product_review_router.delete(
    "/products/{product_id}/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_product_review(
    product_id: uuid.UUID,
    review_id: uuid.UUID,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
):
    await service.delete_product_review(
        current_user.email, product_id, review_id, session
    )
