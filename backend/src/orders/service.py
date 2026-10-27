import uuid
from datetime import datetime, timezone, timezone
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlmodel import select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.models import Address, Cart, CartItem, Order, OrderItem, Product, SubOrder, Vendor
from src.errors import OrderNotFound

from .schemas import (
    CheckoutRequest,
    OrderItemOut,
    OrderOut,
    SubOrderOut,
    VendorOrderItemOut,
    VendorSubOrderOut,
)


class OrderService:
    def _build_order_out(self, order: Order, is_existing: bool = False) -> OrderOut:
        sub_orders_out = []
        for sub in order.sub_orders:
            items_out = [
                OrderItemOut(
                    uid=oi.uid,
                    product_id=oi.product_id,
                    title_snapshot=oi.title_snapshot,
                    price_snapshot=oi.price_snapshot,
                    quantity=oi.quantity,
                    line_total=Decimal(str(oi.price_snapshot)) * oi.quantity,
                    image_url=oi.image_url,
                    product_slug=oi.product_slug,
                )
                for oi in sub.items
            ]
            sub_orders_out.append(
                SubOrderOut(
                    uid=sub.uid,
                    order_id=sub.order_id,
                    vendor_id=sub.vendor_id,
                    store_name=sub.store_name,
                    subtotal=sub.subtotal,
                    status=sub.status,
                    items=items_out,
                    parent_order_status=order.status,
                )
            )
        out = OrderOut(
            uid=order.uid,
            total=order.total,
            payment_method=order.payment_method,
            payment_status=order.payment_status,
            status=order.status,
            address_snapshot=order.address_snapshot,
            sub_orders=sub_orders_out,
            created_at=order.created_at,
        )
        setattr(out, "_is_existing", is_existing)
        return out

    async def checkout(
        self,
        user_id: uuid.UUID,
        data: CheckoutRequest,
        session: AsyncSession,
        idempotency_key: Optional[str] = None,
    ) -> OrderOut:
        """Atomic checkout with pessimistic row-level locking and idempotency:
        validate idempotency → lock products in sorted order (SELECT FOR UPDATE) → validate stock
        → decrement → snapshot → create Order/SubOrders → clear cart.
        """
        # 0. Check idempotency key if provided
        if idempotency_key:
            existing_result = await session.exec(
                select(Order).where(Order.user_id == user_id, Order.idempotency_key == idempotency_key)
            )
            existing_order = existing_result.first()
            if existing_order:
                return self._build_order_out(existing_order, is_existing=True)

        # 1. Fetch address
        addr_result = await session.exec(
            select(Address).where(Address.uid == data.address_id, Address.user_id == user_id)
        )
        addr = addr_result.first()
        if not addr:
            raise HTTPException(status_code=400, detail="Address not found")

        # 2. Fetch cart items
        cart_result = await session.exec(select(Cart).where(Cart.user_id == user_id))
        cart = cart_result.first()
        if not cart or not cart.items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        # 3. Atomically validate and decrement stock in sorted order
        # (deterministic order prevents deadlocks when two carts share overlapping items)
        sorted_items = sorted(cart.items, key=lambda it: it.product_id)
        products_map: Dict[uuid.UUID, Product] = {}
        vendors_map: Dict[uuid.UUID, Vendor] = {}
        vendor_groups: Dict[uuid.UUID, List[CartItem]] = {}

        # Bug 4 fix: validate vendor approval BEFORE touching stock.
        # Pre-fetch all products + vendors in two bulk queries to avoid N+1 round-trips.
        product_ids = [item.product_id for item in sorted_items]
        pre_products_res = await session.exec(
            select(Product).where(Product.uid.in_(product_ids))
        )
        pre_products: Dict[uuid.UUID, Product] = {p.uid: p for p in pre_products_res.all()}
        pre_vendor_ids = {p.vendor_id for p in pre_products.values()}
        pre_vendors_res = await session.exec(
            select(Vendor).where(Vendor.uid.in_(pre_vendor_ids))
        )
        for v in pre_vendors_res.all():
            vendors_map[v.uid] = v

        for item in sorted_items:
            pre_product = pre_products.get(item.product_id)
            if not pre_product or pre_product.status != "active":
                p_name = pre_product.title if pre_product else str(item.product_id)
                raise HTTPException(status_code=400, detail=f"Product unavailable: {p_name}")
            pre_vendor = vendors_map.get(pre_product.vendor_id)
            if not pre_vendor or pre_vendor.status != "approved":
                # Vendor not approved -- reject before any stock is decremented.
                raise HTTPException(status_code=400, detail=f"Product unavailable: {pre_product.title}")

            # Bug 3 fix: extend RETURNING to capture price atomically, eliminating
            # the TOCTOU window between the UPDATE and a subsequent SELECT.
            res = await session.exec(
                text("""
                    UPDATE products
                    SET stock = stock - :qty
                    WHERE uid = :pid AND stock >= :qty AND status = 'active'
                    RETURNING uid, price, title, vendor_id, slug;
                """).params(qty=item.quantity, pid=item.product_id)
            )
            updated_row = res.first()
            if updated_row is None:
                p_check = (await session.exec(select(Product).where(Product.uid == item.product_id))).first()
                if not p_check or p_check.status != "active":
                    p_name = p_check.title if p_check else str(item.product_id)
                    raise HTTPException(status_code=400, detail=f"Product unavailable: {p_name}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for: {p_check.title} (requested: {item.quantity}, available: {p_check.stock})",
                )

            # Atomically captured price -- immune to concurrent price changes.
            atomic_price = Decimal(str(updated_row.price))

            # Refresh the ORM object so relationships (images, etc.) are available.
            p_res = await session.exec(
                select(Product)
                .where(Product.uid == item.product_id)
                .execution_options(populate_existing=True)
            )
            product = p_res.first()
            # Pin price to the value captured inside the UPDATE transaction.
            product.price = atomic_price
            products_map[product.uid] = product
            vendor_groups.setdefault(product.vendor_id, []).append(item)

        # 4. Mock online payment
        payment_status = "pending"
        if data.payment_method == "online_mock":
            payment_status = "paid"  # mock: always succeeds

        # 5. Build address snapshot
        addr_snapshot = {
            "name": addr.name, "phone": addr.phone,
            "line1": addr.line1, "line2": addr.line2,
            "city": addr.city, "state": addr.state, "pincode": addr.pincode,
        }

        # 7. Compute total
        total = Decimal("0.00")
        for items in vendor_groups.values():
            for item in items:
                product = products_map[item.product_id]
                total += Decimal(str(product.price)) * item.quantity

        # 8. Create Order
        order_uid = uuid.uuid4()
        order = Order(
            uid=order_uid,
            user_id=user_id,
            idempotency_key=idempotency_key,
            address_snapshot=addr_snapshot,
            total=total,
            payment_method=data.payment_method,
            payment_status=payment_status,
            status="placed",
        )
        session.add(order)
        try:
            await session.flush()
        except Exception:
            await session.rollback()
            if idempotency_key:
                existing_result = await session.exec(
                    select(Order).where(Order.user_id == user_id, Order.idempotency_key == idempotency_key)
                )
                existing_order = existing_result.first()
                if existing_order:
                    return self._build_order_out(existing_order, is_existing=True)
            raise

        # 9. Create SubOrders + OrderItems
        sub_orders_out = []
        for vendor_id, items in vendor_groups.items():
            subtotal = Decimal("0.00")
            for item in items:
                product = products_map[item.product_id]
                subtotal += Decimal(str(product.price)) * item.quantity

            sub_uid = uuid.uuid4()
            sub = SubOrder(
                uid=sub_uid,
                order_id=order.uid,
                vendor_id=vendor_id,
                subtotal=subtotal,
                status="placed",
            )
            session.add(sub)
            vendor_record = vendors_map.get(vendor_id)
            store_name = vendor_record.store_name if vendor_record else None

            order_items_out = []
            for item in items:
                product = products_map[item.product_id]
                oi_uid = uuid.uuid4()
                oi = OrderItem(
                    uid=oi_uid,
                    sub_order_id=sub.uid,
                    product_id=item.product_id,
                    title_snapshot=product.title,
                    price_snapshot=product.price,
                    quantity=item.quantity,
                )
                session.add(oi)
                order_items_out.append(OrderItemOut(
                    uid=oi.uid,
                    product_id=oi.product_id,
                    title_snapshot=oi.title_snapshot,
                    price_snapshot=oi.price_snapshot,
                    quantity=oi.quantity,
                    line_total=Decimal(str(oi.price_snapshot)) * oi.quantity,
                    image_url=product.images[0].url if product.images else None,
                    product_slug=product.slug,
                ))

            sub_orders_out.append(SubOrderOut(
                uid=sub.uid,
                order_id=sub.order_id,
                vendor_id=sub.vendor_id,
                store_name=store_name,
                subtotal=sub.subtotal,
                status=sub.status,
                items=order_items_out,
                parent_order_status=order.status,
            ))

        # 10. Clear cart
        for item in cart.items:
            await session.delete(item)

        try:
            await session.commit()
            await session.refresh(order)
        except Exception:
            await session.rollback()
            if idempotency_key:
                existing_result = await session.exec(
                    select(Order).where(Order.user_id == user_id, Order.idempotency_key == idempotency_key)
                )
                existing_order = existing_result.first()
                if existing_order:
                    return self._build_order_out(existing_order, is_existing=True)
            raise

        out = OrderOut(
            uid=order.uid,
            total=order.total,
            payment_method=order.payment_method,
            payment_status=order.payment_status,
            status=order.status,
            address_snapshot=order.address_snapshot,
            sub_orders=sub_orders_out,
            created_at=order.created_at,
        )
        setattr(out, "_is_existing", False)
        return out

    async def get_user_orders(self, user_id: uuid.UUID, session: AsyncSession) -> List[Order]:
        result = await session.exec(
            select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc())
        )
        return result.all()

    async def get_order(self, order_uid: uuid.UUID, user_id: uuid.UUID, session: AsyncSession):
        result = await session.exec(
            select(Order).where(Order.uid == order_uid, Order.user_id == user_id)
        )
        order = result.first()
        if not order:
            raise OrderNotFound()
        return order

    async def cancel_order(self, order_uid: uuid.UUID, user_id: uuid.UUID, session: AsyncSession):
        result = await session.exec(
            select(Order).where(Order.uid == order_uid, Order.user_id == user_id).with_for_update()
        )
        order = result.first()
        if not order:
            raise OrderNotFound()

        # Idempotent cancel: if already cancelled, return existing order
        if order.status == "cancelled":
            return order

        # Lock all sub-orders explicitly so concurrent sub-order status updates wait
        subs_res = await session.exec(
            select(SubOrder)
            .where(SubOrder.order_id == order.uid)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        current_subs = subs_res.all()
        if any(sub.status != "placed" for sub in current_subs):
            raise HTTPException(status_code=400, detail="Cannot cancel order once processed by seller")

        if order.status not in ("placed",):
            raise HTTPException(status_code=400, detail="Cannot cancel order in current state")

        order.status = "cancelled"
        if order.payment_method == "online_mock":
            order.payment_status = "refunded"
        order.updated_at = datetime.now(timezone.utc)

        # Bug 1 fix: iterate current_subs (the DB-locked result set) instead of
        # order.sub_orders (ORM selectin cache loaded before the FOR UPDATE lock).
        for sub in current_subs:
            sub.status = "cancelled"
            sub.updated_at = datetime.now(timezone.utc)
            session.add(sub)
            sorted_items = sorted(sub.items, key=lambda it: it.product_id)
            for item in sorted_items:
                p_res = await session.exec(
                    select(Product).where(Product.uid == item.product_id).with_for_update()
                )
                p = p_res.first()
                if p:
                    p.stock += item.quantity
                    session.add(p)

        session.add(order)
        await session.commit()
        await session.refresh(order)
        return order

    async def get_vendor_orders(self, vendor_id: uuid.UUID, session: AsyncSession) -> List[VendorSubOrderOut]:
        result = await session.exec(
            select(SubOrder)
            .where(SubOrder.vendor_id == vendor_id)
            .order_by(SubOrder.created_at.desc())
        )
        sub_orders = result.all()
        out: List[VendorSubOrderOut] = []
        for sub in sub_orders:
            order = sub.order
            if not order:
                o_res = await session.exec(select(Order).where(Order.uid == sub.order_id))
                order = o_res.first()

            items_out = [
                VendorOrderItemOut(
                    uid=item.uid,
                    product_id=item.product_id,
                    title_snapshot=item.title_snapshot,
                    price_snapshot=item.price_snapshot,
                    quantity=item.quantity,
                    line_total=Decimal(str(item.price_snapshot)) * item.quantity,
                    image_url=item.image_url,
                    product_slug=item.product_slug,
                )
                for item in sub.items
            ]

            out.append(
                VendorSubOrderOut(
                    uid=sub.uid,
                    order_id=sub.order_id,
                    vendor_id=sub.vendor_id,
                    subtotal=sub.subtotal,
                    status=sub.status,
                    created_at=sub.created_at,
                    updated_at=sub.updated_at,
                    items=items_out,
                    address_snapshot=order.address_snapshot if order else None,
                    payment_method=order.payment_method if order else None,
                    payment_status=order.payment_status if order else None,
                    parent_order_status=order.status if order else None,
                )
            )
        return out

    async def update_suborder_status(
        self, sub_uid: uuid.UUID, vendor_id: uuid.UUID, new_status: str, session: AsyncSession
    ) -> SubOrderOut:
        sub_lookup = await session.exec(
            select(SubOrder).where(SubOrder.uid == sub_uid, SubOrder.vendor_id == vendor_id)
        )
        sub_pre = sub_lookup.first()
        if not sub_pre:
            raise OrderNotFound()

        # Deterministic locking: lock parent Order first, then SubOrder
        order_result = await session.exec(
            select(Order)
            .where(Order.uid == sub_pre.order_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        order = order_result.first()
        if not order or order.status == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot update sub-order: parent order has been cancelled")

        result = await session.exec(
            select(SubOrder)
            .where(SubOrder.uid == sub_uid, SubOrder.vendor_id == vendor_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        sub = result.first()
        if not sub:
            raise OrderNotFound()
        if sub.status == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot update sub-order: sub-order is already cancelled")

        allowed = {
            "placed": ["confirmed", "cancelled"],
            "confirmed": ["shipped", "cancelled"],
            "shipped": ["delivered"],
        }
        if new_status not in allowed.get(sub.status, []):
            raise HTTPException(status_code=400, detail=f"Cannot move from {sub.status} to {new_status}")

        # If seller cancels a placed or confirmed suborder, restore item stock
        if new_status == "cancelled" and sub.status in ("placed", "confirmed"):
            for item in sub.items:
                p = await session.get(Product, item.product_id)
                if p:
                    p.stock += item.quantity

        sub.status = new_status
        sub.updated_at = datetime.now(timezone.utc)
        session.add(sub)

        # Automatically sync the parent Order.status so the customer's top tracking bar moves forward.
        # Bug 2 fix: reuse the already-locked `order` object acquired above --
        # issuing a second unlocked SELECT here creates a race condition.
        parent_status = sub.status
        if order:
            all_subs_result = await session.exec(select(SubOrder).where(SubOrder.order_id == order.uid))
            all_subs = all_subs_result.all()

            active_subs = [s for s in all_subs if s.status != "cancelled"]
            if not active_subs:
                order.status = "cancelled"
            elif all(s.status == "delivered" for s in active_subs):
                order.status = "delivered"
            elif any(s.status in ("shipped", "delivered") for s in active_subs):
                order.status = "shipped"
            elif any(s.status == "confirmed" for s in active_subs):
                order.status = "confirmed"
            else:
                order.status = "placed"

            order.updated_at = datetime.now(timezone.utc)
            session.add(order)
            parent_status = order.status

        await session.commit()
        await session.refresh(sub)

        v_result = await session.exec(select(Vendor).where(Vendor.uid == sub.vendor_id))
        vendor_record = v_result.first()
        store_name = vendor_record.store_name if vendor_record else None

        items_out = [
            OrderItemOut(
                uid=item.uid,
                product_id=item.product_id,
                title_snapshot=item.title_snapshot,
                price_snapshot=item.price_snapshot,
                quantity=item.quantity,
                line_total=Decimal(str(item.price_snapshot)) * item.quantity,
                image_url=item.image_url,
                product_slug=item.product_slug,
            )
            for item in sub.items
        ]

        return SubOrderOut(
            uid=sub.uid,
            order_id=sub.order_id,
            vendor_id=sub.vendor_id,
            store_name=store_name,
            subtotal=sub.subtotal,
            status=sub.status,
            items=items_out,
            parent_order_status=parent_status,
        )
