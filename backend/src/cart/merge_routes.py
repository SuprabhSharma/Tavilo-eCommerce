"""
Guest-to-authenticated cart and wishlist merge endpoint.

Requires a fully verified authenticated user — this is non-negotiable.
No unauthenticated or unverified access is possible.
"""

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from src.auth.dependencies import get_verified_user
from src.db.main import get_session
from src.db.models import User

from .merge_schemas import GuestMergeRequest, GuestMergeResult
from .merge_service import GuestMergeService

merge_router = APIRouter()
_service = GuestMergeService()


@merge_router.post("/merge", response_model=GuestMergeResult, tags=["cart"])
async def merge_guest_cart(
    data: GuestMergeRequest,
    current_user: User = Depends(get_verified_user),
    session: AsyncSession = Depends(get_session),
) -> GuestMergeResult:
    """
    Merge a guest (localStorage) cart and wishlist into the authenticated
    user's server-persisted cart and wishlist.

    Idempotent: repeating the same request with the same guest_cart_id
    returns the current state without duplicating quantities.

    Security:
    - Requires verified authentication (get_verified_user dependency).
    - Backend fetches authoritative prices and stock from the database.
    - Client-supplied product IDs are validated; prices are ignored.
    - A GuestCartMergeReceipt prevents duplicate merges.
    """
    return await _service.merge(current_user.uid, data, session)
