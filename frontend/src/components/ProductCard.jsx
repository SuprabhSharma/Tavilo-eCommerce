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
import { useProductCardActionFlags } from "./ProductActionState";

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

// Bounded selector caches (FIFO eviction at 500 entries) so long infinite-scroll
// browsing sessions never accumulate unbounded closures in memory.
const MAX_SEL_CACHE = 500;
const cartSelCache  = new Map();
const wishSelCache  = new Map();

function getCartSel(uid) {
  let sel = cartSelCache.get(uid);
  if (!sel) {
    if (cartSelCache.size >= MAX_SEL_CACHE) {
      cartSelCache.delete(cartSelCache.keys().next().value);
    }
    sel = (s) => s.cart.items.some((i) => i.productId === uid);
    cartSelCache.set(uid, sel);
  }
  return sel;
}
function getWishSel(uid) {
  let sel = wishSelCache.get(uid);
  if (!sel) {
    if (wishSelCache.size >= MAX_SEL_CACHE) {
      wishSelCache.delete(wishSelCache.keys().next().value);
    }
    sel = (s) => s.wishlist.items.some((i) => i.productId === uid);
    wishSelCache.set(uid, sel);
  }
  return sel;
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
  const { inCart: authInCart, saved: authSaved } = useProductCardActionFlags(product.uid);

  // ── Guest Store — one hook per scalar value ───────────────────────────────
  const isGuestInCart          = useGuestStore(getCartSel(product.uid));
  const isGuestSaved           = useGuestStore(getWishSel(product.uid));
  const addToGuestCart         = useGuestStore(selAddToGuestCart);
  const addToGuestWishlist     = useGuestStore(selAddToGuestWishlist);
  const removeFromGuestWishlist = useGuestStore(selRemoveFromGuestWishlist);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const saved  = isLoggedIn ? authSaved  : isGuestSaved;
  const inCart = isLoggedIn ? authInCart : isGuestInCart;

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

  const { mutate: mutateCart } = cartMutation;
  const { mutate: mutateWishlist } = wishlistMutation;

  // ── Handlers (stable via useCallback) ────────────────────────────────────
  const addToCart = useCallback(
    (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      setMessage("");
      if (inCart) { navigate("/cart"); return; }
      if (!product.is_available || (typeof product.available_stock === "number" && product.available_stock <= 0)) return;
      if (actionInFlight.current) return;
      if (!isLoggedIn) {
        addToGuestCart(product.uid, 1);
        setMessage("Product added to cart");
        return;
      }
      actionInFlight.current = true;
      mutateCart();
    },
    [inCart, isLoggedIn, navigate, addToGuestCart, mutateCart, product.uid, product.is_available, product.available_stock],
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
      mutateWishlist(saved);
    },
    [isLoggedIn, isGuestSaved, saved, product.uid, removeFromGuestWishlist, addToGuestWishlist, mutateWishlist],
  );

  // ── Image props ───────────────────────────────────────────────────────────
  const rawSrc = productImage(product, 0);
  const src    = imageVariant(rawSrc, 480) || rawSrc;
  const srcSet = imageSrcSet(rawSrc);

  return (
    <article className="catalog-card group flex min-w-0 flex-col overflow-hidden rounded-2card border border-slate-200/90 bg-white p-2.5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-card-hover sm:p-3 relative">
      <div className="relative block aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-900/5">
        <Link
          to={`/p/${product.slug}`}
          className="block h-full w-full"
          aria-label={product.title}
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
        </Link>
        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded-md bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            Sold out
          </span>
        )}
        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
          onClick={toggleWishlist}
          disabled={wishlistMutation.isPending}
          className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full transition-all active:scale-90 shadow-sm ${
            saved
              ? "bg-red-50 text-red-500 border border-red-200 shadow-red-500/20"
              : "bg-white/95 text-slate-600 hover:text-red-500 border border-white/80 hover:bg-white"
          } disabled:opacity-40`}
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1 pt-2">
        {product.vendor?.slug ? (
          <Link
            to={`/store/${product.vendor.slug}`}
            className="mb-1 truncate text-xs font-medium text-muted transition-colors hover:text-brand-600 hover:underline"
            aria-label={`Shop ${product.vendor.store_name}`}
          >
            {product.vendor.store_name}
          </Link>
        ) : (
          <p className="mb-1 truncate text-xs text-muted">
            {product.vendor_name || "Tavilo store"}
          </p>
        )}
        <Link
          to={`/p/${product.slug}`}
          className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-brand-600 transition-colors"
        >
          {product.title}
        </Link>
        <div className="mt-1">
          <Rating value={product.rating_avg} count={product.rating_count ?? product.review_count} compact />
        </div>
        <div className="mt-auto pt-2">
          <ProductPrice price={product.price} mrp={product.mrp} />
          <button
            type="button"
            aria-label={inCart ? "Go to cart" : "Add to cart"}
            aria-pressed={inCart}
            onClick={addToCart}
            disabled={(!product.is_available && !inCart) || cartMutation.isPending}
            className={`mt-2.5 inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold tracking-tight transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
              inCart
                ? "bg-emerald-600 text-white shadow-[0_2px_6px_rgba(5,150,105,0.3),inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-emerald-700"
                : "btn-3d-primary text-white"
            }`}
          >
            {inCart ? <ShoppingCart size={15} strokeWidth={2.2} /> : <ShoppingBag size={15} strokeWidth={2.2} />}
            <span>{inCart ? "Go to cart" : "Add to cart"}</span>
          </button>
        </div>
        {message && (
          <p className="mt-1.5 truncate text-[11px] font-medium text-brand-700" role="status" aria-live="polite">
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
