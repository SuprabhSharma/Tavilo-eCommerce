"""
Schemas for the guest-to-authenticated cart and wishlist merge endpoint.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from src.cart.schemas import CartOut
from src.wishlist.schemas import WishlistOut


class GuestCartItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., ge=1, le=99)


class GuestMergeRequest(BaseModel):
    """
    Payload for the guest-to-authenticated merge endpoint.

    guest_cart_id is used as the idempotency key — the backend stores a receipt
    so that retrying the same request (e.g., after a network timeout) cannot
    duplicate cart quantities.
    """

    guest_cart_id: str = Field(..., min_length=36, max_length=36)
    cart_items: list[GuestCartItemIn] = Field(default_factory=list, max_length=50)
    wishlist_product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class MergeConflict(BaseModel):
    product_id: uuid.UUID
    reason: Literal["not_found", "not_active", "out_of_stock", "quantity_capped"]
    requested_quantity: int | None = None
    applied_quantity: int | None = None
    message: str


class GuestMergeResult(BaseModel):
    cart: CartOut
    wishlist: WishlistOut
    conflicts: list[MergeConflict]
    merged_at: datetime
    was_idempotent: bool = False
