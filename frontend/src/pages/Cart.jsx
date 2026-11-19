import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  getCart,
  getProductsByIds,
  removeCartItem,
  updateCartItem,
} from "../api/shop";
import ProductPrice from "../components/ProductPrice";
import ProductImage from "../components/ProductImage";
import { Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { formatCurrency, imageVariant, productImage } from "../lib/formatters";
import { getErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";

export default function Cart() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isReady = useAuthStore((state) => state.isReady);
  const loggedIn = Boolean(accessToken);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Authenticated Cart ─────────────────────────────────────────────────────
  const authQuery = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: loggedIn,
  });

  const removeMutation = useMutation({
    mutationFn: removeCartItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });

  const [rowErrors, setRowErrors] = useState({});

  const updateMutation = useMutation({
    mutationFn: ({ uid, quantity }) => updateCartItem(uid, quantity),
    onSuccess: () => {
      setRowErrors({});
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      const msg = getErrorMessage(error);
      if (variables?.uid) {
        setRowErrors((prev) => ({
          ...prev,
          [variables.uid]: { msg, timestamp: Date.now() },
        }));
      }
    },
  });

  // ── Guest Cart ─────────────────────────────────────────────────────────────
  const guestItems = useGuestStore((state) => state.cart.items);
  const updateGuestQty = useGuestStore((state) => state.updateGuestCartQty);
  const removeFromGuest = useGuestStore((state) => state.removeFromGuestCart);

  const guestProductIds = useMemo(
    () => guestItems.map((i) => i.productId),
    [guestItems],
  );

  const guestProductsQuery = useQuery({
    queryKey: ["guest-cart-products", guestProductIds],
    queryFn: () => getProductsByIds(guestProductIds),
    enabled: !loggedIn && guestProductIds.length > 0,
  });

  // Construct items for display
  const { data, subtotal, hasStockIssues } = useMemo(() => {
    if (loggedIn) {
      const items = authQuery.data?.items || [];
      const sub = authQuery.data?.subtotal || 0;
      return { data: items, subtotal: sub, hasStockIssues: false };
    }

    // Guest mode: ensure items are ordered with most recently added at the top
    const sortedGuestItems = [...guestItems].sort((a, b) => {
      const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return timeB - timeA;
    });

    // Guest mode: map stored items to server-authoritative product data
    const productMap = new Map();
    for (const p of guestProductsQuery.data?.items || []) {
      productMap.set(p.uid, p);
    }

    let sub = 0;
    let stockIssue = false;

    const items = sortedGuestItems.map((gItem) => {
      const product = productMap.get(gItem.productId);
      const unitPrice = product ? Number(product.price) : 0;
      const lineTotal = unitPrice * gItem.quantity;
      sub += lineTotal;

      const isOutOfStock = product && !product.is_available;
      if (isOutOfStock) stockIssue = true;

      return {
        uid: gItem.productId,
        product_id: gItem.productId,
        quantity: gItem.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        product_title: product ? product.title : "Loading product details…",
        product,
        isOutOfStock,
        // For guest mode, derive max_qty from server's available_stock
        // (= min(real_stock, vendor_max_order_qty)) returned by ProductPublicOut
        max_qty: product
          ? (product.available_stock ?? product.stock ?? Infinity)
          : Infinity,
      };
    });

    return { data: items, subtotal: sub, hasStockIssues: stockIssue };
  }, [loggedIn, authQuery.data, guestItems, guestProductsQuery.data?.items]);

  const isLoading = !isReady || (loggedIn
    ? authQuery.isLoading
    : guestProductIds.length > 0 && guestProductsQuery.isLoading);

  const isError = loggedIn ? authQuery.isError : guestProductsQuery.isError;
  const refetch = loggedIn ? authQuery.refetch : guestProductsQuery.refetch;

  if (isLoading) return <CartSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState onRetry={refetch} />
      </div>
    );
  }

  const handleUpdateQuantity = (item, newQuantity) => {
    if (newQuantity < 1) return;
    if (loggedIn) {
      updateMutation.mutate({ uid: item.uid, quantity: newQuantity });
    } else {
      // Guest: enforce cap client-side before writing to store
      const cap = item.max_qty;
      if (typeof cap === "number" && newQuantity > cap) return;
      updateGuestQty(item.product_id, newQuantity);
    }
  };

  const handleRemove = (item) => {
    if (loggedIn) {
      removeMutation.mutate(item.uid);
    } else {
      removeFromGuest(item.product_id);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <ShoppingBag className="text-brand-600" />
        <h1 className="text-2xl font-bold">Your cart</h1>
      </div>

      {!data.length ? (
        <div className="mt-8">
          <EmptyState
            title="Your cart is empty"
            description="Find something you love and it will show up here."
            action={
              <Link to="/products">
                <Button>Continue shopping</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {data.map((item) => (
              <CartItemRow
                key={item.uid}
                item={item}
                errorInfo={rowErrors[item.uid]}
                isUpdating={updateMutation.isPending}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemove}
              />
            ))}
          </div>

          <aside className="h-fit rounded-card border border-line bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-bold">Price details</h2>
            <div className="mt-5 flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="mt-3 flex justify-between text-sm text-muted">
              <span>Delivery</span>
              <span className="font-medium text-emerald-600">FREE</span>
            </div>
            <div className="my-5 h-px bg-line" />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <Button
              className="mt-5 w-full"
              disabled={hasStockIssues && loggedIn}
              onClick={() =>
                navigate(loggedIn ? "/checkout" : "/account?next=/checkout")
              }
            >
              Proceed to checkout
            </Button>
            {!loggedIn && (
              <p className="mt-3 text-center text-xs text-muted">
                Sign in to complete your order
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Individual cart row with quantity controls.
 *
 * Max-quantity logic (Flipkart/Amazon model):
 *   - For authenticated users: `item.max_qty` and `item.at_limit` come from
 *     the server via CartItemOut computed fields (= min(stock, vendor cap)).
 *   - For guests: `item.max_qty` is derived from `product.available_stock`
 *     (= min(stock, max_order_qty)) sent by ProductPublicOut.
 *   - No permanent warning banners or clutter on the page.
 *   - When the user attempts to increase beyond available quantity (e.g. clicking +
 *     when quantity is already at maximum), a sleek e-commerce pop-up toast/tooltip
 *     appears directly above the quantity control with clean text:
 *     "You can add maximum of N for this product"
 *   - Automatically disappears after 2.8 seconds.
 */
function CartItemRow({ item, isUpdating, onUpdateQuantity, onRemove, errorInfo }) {
  const maxQty = item.max_qty ?? item.product?.available_stock ?? Infinity;
  const atLimit = item.quantity >= maxQty;
  const isOutOfStock = item.isOutOfStock || (item.product && !item.product.is_available);

  // Pop-up state for max-quantity notification
  const [popupMsg, setPopupMsg] = useState("");
  const [popupKey, setPopupKey] = useState(0);
  const timerRef = useRef(null);

  const showPopup = (msg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPopupMsg(msg);
    setPopupKey((prev) => prev + 1);
    timerRef.current = setTimeout(() => {
      setPopupMsg("");
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // If a server update fails with a limit error for this item, trigger the pop-up
  useEffect(() => {
    if (errorInfo?.msg) {
      showPopup(errorInfo.msg);
    }
  }, [errorInfo]);

  const handleIncrease = () => {
    if (isOutOfStock) return;
    if (atLimit) {
      // Trigger sleek e-commerce pop-up when attempting to exceed maximum quantity
      showPopup(`You can add maximum of ${maxQty} for this product`);
      return;
    }
    setPopupMsg("");
    onUpdateQuantity(item, item.quantity + 1);
  };

  const handleDecrease = () => {
    setPopupMsg("");
    onUpdateQuantity(item, item.quantity - 1);
  };

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-3 sm:gap-4 sm:p-4">
      <div className="flex gap-3 sm:gap-5">
        {item.product?.slug ? (
          <Link
            to={`/p/${item.product.slug}`}
            className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 transition hover:opacity-90"
          >
            <ProductImage
              src={imageVariant(productImage(item.product), 160)}
              alt={item.product_title || ""}
              width="96"
              height="96"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
            <ProductImage
              src={imageVariant(productImage(item.product), 160)}
              alt={item.product_title || ""}
              width="96"
              height="96"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {item.product?.slug ? (
            <Link
              to={`/p/${item.product.slug}`}
              className="line-clamp-2 text-sm font-semibold text-ink transition hover:text-brand-600"
            >
              {item.product_title}
            </Link>
          ) : (
            <p className="line-clamp-2 text-sm font-semibold">
              {item.product_title}
            </p>
          )}

          <ProductPrice
            price={item.unit_price}
            mrp={item.product?.mrp}
            className="mt-1 text-sm"
          />

          {/* Out-of-stock indicator */}
          {isOutOfStock && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600" role="alert">
              <AlertTriangle size={14} /> Out of stock
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            {/* Quantity Stepper with E-Commerce Floating Popup */}
            <div className="relative flex h-9 items-center rounded-lg border border-line bg-white">
              {/*
                E-commerce pop-up style:
                - Sleek dark charcoal pill with downward arrow
                - Clean typography, high contrast
                - Appears only on clicking + when already at max available quantity
                - Auto-dismisses after 2.8 seconds
              */}
              {popupMsg && (
                <div
                  key={popupKey}
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute -top-10 left-0 z-30 flex items-center whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-xl transition-all duration-150 animate-in fade-in slide-in-from-bottom-1"
                >
                  <span>{popupMsg}</span>
                  {/* Downward pointing arrow */}
                  <div className="absolute top-full left-6 -mt-px h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-slate-900" />
                </div>
              )}

              {/* Decrease */}
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={item.quantity <= 1 || isUpdating}
                onClick={handleDecrease}
                className="grid h-9 w-8 place-items-center text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40"
              >
                <Minus size={14} />
              </button>

              <span className="w-8 text-center text-sm font-semibold tabular-nums text-ink">
                {item.quantity}
              </span>

              {/* Increase: stays clickable so clicking it past max triggers the pop-up */}
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={isUpdating || isOutOfStock}
                onClick={handleIncrease}
                className="grid h-9 w-8 place-items-center text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>

            <button
              type="button"
              aria-label={`Remove ${item.product_title}`}
              onClick={() => onRemove(item)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <p className="hidden max-w-full self-center break-words text-right text-sm font-bold tabular-nums [overflow-wrap:anywhere] sm:block">
          {formatCurrency(item.line_total)}
        </p>
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-8 h-28 w-full" />
    </div>
  );
}
