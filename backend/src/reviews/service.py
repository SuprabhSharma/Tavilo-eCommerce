import logging
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import status
from fastapi.exceptions import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import desc, select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.service import UserService
from src.books.service import BookService
from src.db.models import Order, OrderItem, Product, Review, SubOrder
from src.errors import BookNotFound, ProductNotFound, ReviewNotFound, UserNotFound

from .schemas import ReviewCreateModel

book_service = BookService()
user_service = UserService()


class ReviewService:
    async def _get_product(
        self, product_id: uuid.UUID, session: AsyncSession, for_update: bool = False
    ) -> Product:
        statement = select(Product).where(Product.uid == product_id)
        if for_update:
            statement = statement.with_for_update()
        result = await session.exec(statement)
        product = result.first()
        if not product:
            raise ProductNotFound()
        return product

    async def _has_delivered_purchase(
        self, user_id: uuid.UUID, product_id: uuid.UUID, session: AsyncSession
    ) -> bool:
        result = await session.exec(
            select(OrderItem.uid)
            .join(SubOrder, OrderItem.sub_order_id == SubOrder.uid)
            .join(Order, SubOrder.order_id == Order.uid)
            .where(
                Order.user_id == user_id,
                OrderItem.product_id == product_id,
                SubOrder.status == "delivered",
            )
            .limit(1)
        )
        return result.first() is not None

    async def _refresh_product_rating(self, product: Product, session: AsyncSession) -> None:
        avg_result = await session.exec(
            select(func.avg(Review.rating), func.count(Review.uid)).where(
                Review.product_id == product.uid,
                Review.verified_purchase.is_(True),
            )
        )
        avg, count = avg_result.one()
        product.rating_avg = Decimal(str(avg or 0)).quantize(Decimal("0.01"))
        product.rating_count = int(count or 0)
        session.add(product)

    async def get_review_status(
        self, user_email: str, product_id: uuid.UUID, session: AsyncSession
    ) -> dict:
        user = await user_service.get_user_by_email(email=user_email, session=session)
        if not user:
            raise UserNotFound()
        product = await self._get_product(product_id, session)
        existing = (
            await session.exec(
                select(Review).where(
                    Review.user_id == user.uid,
                    Review.product_id == product.uid,
                    Review.verified_purchase.is_(True),
                )
            )
        ).first()
        return {
            "can_review": await self._has_delivered_purchase(user.uid, product.uid, session),
            "review": existing,
        }

    async def add_review_to_book(
        self, user_email: str, book_uid: str, review_data: ReviewCreateModel, session: AsyncSession,
    ):
        try:
            book = await book_service.get_book(book_uid=book_uid, session=session)
            user = await user_service.get_user_by_email(email=user_email, session=session)
            if not book:
                raise BookNotFound()
            if not user:
                raise UserNotFound()
            new_review = Review(**review_data.model_dump(), user=user, book=book)
            session.add(new_review)
            await session.commit()
            return new_review
        except Exception as e:
            logging.exception(e)
            raise HTTPException(detail="Oops... something went wrong!", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    async def add_review_to_product(
        self, user_email: str, product_id: uuid.UUID, review_data: ReviewCreateModel, session: AsyncSession,
    ):
        user = await user_service.get_user_by_email(email=user_email, session=session)
        if not user:
            raise UserNotFound()
        product = await self._get_product(product_id, session, for_update=True)
        if not await self._has_delivered_purchase(user.uid, product.uid, session):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can review this product after your order is delivered.",
            )
        existing = (
            await session.exec(
                select(Review).where(
                    Review.user_id == user.uid,
                    Review.product_id == product.uid,
                    Review.verified_purchase.is_(True),
                )
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reviewed this product. Edit your existing review instead.",
            )
        review = Review(
            **review_data.model_dump(),
            user_id=user.uid,
            product_id=product.uid,
            verified_purchase=True,
        )
        session.add(review)
        try:
            await session.flush()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reviewed this product. Edit your existing review instead.",
            )
        await self._refresh_product_rating(product, session)
        await session.commit()
        await session.refresh(review)
        return review

    async def update_product_review(
        self,
        user_email: str,
        product_id: uuid.UUID,
        review_id: uuid.UUID,
        review_data: ReviewCreateModel,
        session: AsyncSession,
    ):
        user = await user_service.get_user_by_email(email=user_email, session=session)
        if not user:
            raise UserNotFound()
        product = await self._get_product(product_id, session, for_update=True)
        if not await self._has_delivered_purchase(user.uid, product.uid, session):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can edit this review only after your order is delivered.",
            )
        result = await session.exec(
            select(Review)
            .where(
                Review.uid == review_id,
                Review.user_id == user.uid,
                Review.product_id == product.uid,
                Review.verified_purchase.is_(True),
            )
            .with_for_update()
        )
        review = result.first()
        if not review:
            raise ReviewNotFound()
        review.rating = review_data.rating
        review.review_text = review_data.review_text
        review.updated_at = datetime.now()
        session.add(review)
        await self._refresh_product_rating(product, session)
        await session.commit()
        await session.refresh(review)
        return review

    async def delete_product_review(
        self,
        user_email: str,
        product_id: uuid.UUID,
        review_id: uuid.UUID,
        session: AsyncSession,
    ) -> None:
        """Delete only the caller's product review and immediately repair its aggregate."""
        user = await user_service.get_user_by_email(email=user_email, session=session)
        if not user:
            raise UserNotFound()
        product = await self._get_product(product_id, session, for_update=True)
        result = await session.exec(
            select(Review)
            .where(
                Review.uid == review_id,
                Review.user_id == user.uid,
                Review.product_id == product.uid,
                Review.verified_purchase.is_(True),
            )
            .with_for_update()
        )
        review = result.first()
        if not review:
            raise ReviewNotFound()
        await session.delete(review)
        await session.flush()
        await self._refresh_product_rating(product, session)
        await session.commit()

    async def get_review(self, review_uid: str, session: AsyncSession):
        result = await session.exec(select(Review).where(Review.uid == review_uid))
        return result.first()

    async def get_all_reviews(self, session: AsyncSession):
        result = await session.exec(select(Review).order_by(desc(Review.created_at)))
        return result.all()

    async def delete_review_to_from_book(self, review_uid: str, user_email: str, session: AsyncSession):
        user = await user_service.get_user_by_email(user_email, session)
        review = await self.get_review(review_uid, session)
        if not review or (review.user_id != user.uid):
            raise HTTPException(detail="Cannot delete this review", status_code=status.HTTP_403_FORBIDDEN)
        await session.delete(review)
        await session.commit()
