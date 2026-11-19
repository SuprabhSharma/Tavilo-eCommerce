import { memo, useCallback, useRef, useState } from "react";
import ProductPrice from "./ProductPrice";
import { Heart, ShoppingBag, ShoppingCart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCartItem, addWishlist, removeWishlist } from "../api/shop";
import { imageSrcSet, imageVariant, productImage } from "../lib/formatters";
import ProductImage from "./ProductImage";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";
import { getErrorMessage } from "../lib/errors";
import { Rating } from "./ui";
import { useProductActionState } from "./ProductActionState";

// ── Module-level stable selectors ─────────────────────────────────────────────
//
// RULE: Every selector passed to useAuthStore / useGuestStore MUST return a
// primitive or a stable reference. Returning a NEW object `{ a, b, c }` on
// every call causes useSyncExternalStore (used internally by Zustand) to see
// the snapshot as "changed" on every store write, which creates an infinite
// render loop and crashes the app with:
//   "Warning: The result of getSnapshot should be cached"
//   "Maximum update depth exceeded"
//
// FIX: One selector per value. Zustand actions are initialized once and their
// function references never change — selecting them individually is safe and
// gives Zustand a stable primitive (function pointer) to compare with ===.

const selectAccessToken           = (s) => s.accessToken;

// Boolean primitives — always stable for ===.
// These are closures created at module init time, NOT inside the component.
// Using a Map keyed by productId so each card gets its own cached selector
// without re-creating closures on every render.
const cartSelCache  = new Map();
const wishSelCache  = new Map();

function getCartSel(uid) {
  if (!cartSelCache.has(uid))
    cartSelCache.set(uid, (s) => s.cart.items.some((i) => i.productId === uid));
  return cartSelCache.get(uid);
}
function getWishSel(uid) {
  if (!wishSelCache.has(uid))
    wishSelCache.set(uid, (s) => s.wishlist.items.some((i) => i.productId === uid));
  return wishSelCache.get(uid);
}

// Individual action selectors — return the same function reference every time
// because Zustand stores actions as stable closures on the state object.
const selAddToGuestCart          = (s) => s.addToGuestCart;
const selAddToGuestWishlist      = (s) => s.addToGuestWishlist;
const selRemoveFromGuestWishlist = (s) => s.removeFromGuestWishlist;

// ─────────────────────────────────────────────────────────────────────────────

function ProductCard({ product, priority = false }) {
  const navigate       = useNavigate();
  const actionInFlight = useRef(false);
  const isLoggedIn     = Boolean(useAuthStore(selectAccessToken));
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const { cartIds, wishlistIds } = useProductActionState();

  // ── Guest Store — one hook per scalar value ───────────────────────────────
  const isGuestInCart          = useGuestStore(getCartSel(product.uid));
  const isGuestSaved           = useGuestStore(getWishSel(product.uid));
  const addToGuestCart         = useGuestStore(selAddToGuestCart);
  const addToGuestWishlist     = useGuestStore(selAddToGuestWishlist);
  const removeFromGuestWishlist = useGuestStore(selRemoveFromGuestWishlist);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const saved  = isLoggedIn ? wishlistIds.has(product.uid) : isGuestSaved;
  const inCart = isLoggedIn ? cartIds.has(product.uid)     : isGuestInCart;

  // ── Cart mutation with optimistic update ──────────────────────────────────
  const cartMutation = useMutation({
    mutationFn: () => addCartItem(product.uid),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previous = queryClient.getQueryData(["cart"]);
      queryClient.setQueryData(["cart"], (old) => {
        if (!old) return old;
        if (old.items?.some((i) => i.product_id === product.uid)) return old;
        return {
          ...old,
          items: [
            ...(old.items ?? []),
            {
              uid: `optimistic-${product.uid}`,
              product_id: product.uid,
              quantity: 1,
              unit_price: product.price,
              line_total: product.price,
              product_title: product.title,
              product,
            },
          ],
        };
      });
      return { previous };
    },
    onSuccess: (data) => {
      setMessage("Product added to cart");
      if (data) queryClient.setQueryData(["cart"], data);
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["cart"], context.previous);
      setMessage(getErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      actionInFlight.current = false;
    },
  });

  // ── Wishlist mutation ─────────────────────────────────────────────────────
  const wishlistMutation = useMutation({
    mutationFn: () => (saved ? removeWishlist(product.uid) : addWishlist(product.uid)),
    onSuccess: (_, wasSaved) => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setMessage(wasSaved ? "Product removed from wishlist" : "Product added to wishlist");
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  // ── Handlers (stable via useCallback) ────────────────────────────────────
  const addToCart = useCallback(
    (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      setMessage("");
      if (inCart) { navigate("/cart"); return; }
      if (actionInFlight.current) return;
      if (!isLoggedIn) {
        addToGuestCart(product.uid, 1);
        setMessage("Product added to cart");
        return;
      }
      actionInFlight.current = true;
      cartMutation.mutate();
    },
    [inCart, isLoggedIn, navigate, addToGuestCart, cartMutation, product.uid],
  );

  const toggleWishlist = useCallback(
    (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      setMessage("");
      if (!isLoggedIn) {
        if (isGuestSaved) {
          removeFromGuestWishlist(product.uid);
          setMessage("Product removed from wishlist");
        } else {
          addToGuestWishlist(product.uid);
          setMessage("Product added to wishlist");
        }
        return;
      }
      wishlistMutation.mutate(saved);
    },
    [isLoggedIn, isGuestSaved, saved, product.uid, removeFromGuestWishlist, addToGuestWishlist, wishlistMutation],
  );

  // ── Image props ───────────────────────────────────────────────────────────
  const rawSrc = productImage(product, 0);
  const src    = imageVariant(rawSrc, 480) || rawSrc;
  const srcSet = imageSrcSet(rawSrc);

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white p-2.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-float sm:p-3">
      <Link
        to={`/p/${product.slug}`}
        className="relative block aspect-square overflow-hidden rounded-lg bg-slate-100"
      >
        <ProductImage
          src={src}
          srcSet={srcSet}
          sizes="(min-width:1024px) 25vw, 50vw"
          alt={product.title}
          width={480}
          height={480}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          fallbackSeed={product.slug || product.uid}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">
            Sold out
          </span>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col px-1 pt-2">
        <p className="mb-1 truncate text-xs text-muted">
          {product.vendor_name || product.vendor?.store_name || "Tavilo store"}
        </p>
        <Link
          to={`/p/${product.slug}`}
          className="line-clamp-2 text-sm font-semibold leading-5 text-ink hover:text-brand-600"
        >
          {product.title}
        </Link>
        <div className="mt-1">
          <Rating value={product.rating_avg} count={product.rating_count ?? product.review_count} compact />
        </div>
        <div className="pt-1">
          <ProductPrice price={product.price} mrp={product.mrp} />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label={inCart ? "Go to cart" : "Add to cart"}
              aria-pressed={inCart}
              onClick={addToCart}
              disabled={(!product.is_available && !inCart) || cartMutation.isPending}
              className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                inCart
                  ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
                  : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100"
              }`}
            >
              {inCart ? <ShoppingCart size={16} strokeWidth={2.25} /> : <ShoppingBag size={16} strokeWidth={2.25} />}
              <span>{inCart ? "Go to cart" : "Add to cart"}</span>
            </button>
            <button
              type="button"
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              onClick={toggleWishlist}
              disabled={wishlistMutation.isPending}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
                saved
                  ? "border-red-200 bg-red-50 text-red-500"
                  : "border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              } disabled:opacity-40`}
            >
              <Heart size={19} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-1 truncate text-[11px] text-muted" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}

// memo() prevents re-renders when parent re-renders but product props unchanged.
// Critical for large product grids (100+ cards on the listing page).
export default memo(ProductCard);
