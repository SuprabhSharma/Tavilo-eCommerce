import { memo, useCallback, useState } from "react";
import ProductPrice from "./ProductPrice";
import { Check, Heart, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addCartItem,
  addWishlist,
  removeCartItem,
  removeWishlist,
} from "../api/shop";
import { productImage } from "../lib/formatters";
import { generateProductPlaceholderSvg } from "../lib/placeholders";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";
import { getErrorMessage } from "../lib/errors";
import { Rating } from "./ui";
import { useProductActionState } from "./ProductActionState";

function ProductCard({ product }) {
  const isLoggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const { cartIds, wishlistIds } = useProductActionState();

  // ── Guest Store State ──────────────────────────────────────────────────────
  const isGuestInCart = useGuestStore((state) =>
    state.cart.items.some((i) => i.productId === product.uid),
  );
  const isGuestSaved = useGuestStore((state) =>
    state.wishlist.items.some((i) => i.productId === product.uid),
  );
  const addToGuestCart = useGuestStore((state) => state.addToGuestCart);
  const removeFromGuestCart = useGuestStore((state) => state.removeFromGuestCart);
  const addToGuestWishlist = useGuestStore((state) => state.addToGuestWishlist);
  const removeFromGuestWishlist = useGuestStore(
    (state) => state.removeFromGuestWishlist,
  );

  // ── Authenticated Server State ─────────────────────────────────────────────
  const saved = isLoggedIn
    ? wishlistIds.has(product.uid)
    : isGuestSaved;

  const inCart = isLoggedIn
    ? cartIds.has(product.uid)
    : isGuestInCart;

  const wishlistMutation = useMutation({
    mutationFn: () =>
      saved ? removeWishlist(product.uid) : addWishlist(product.uid),
    onSuccess: (_, wasSaved) => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setMessage(
        wasSaved
          ? "Product removed from wishlist"
          : "Product added to wishlist",
      );
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const toggleWishlist = () => {
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
  };

  const cartMutation = useMutation({
    mutationFn: () => addCartItem(product.uid),
    onSuccess: () => {
      setMessage("Product added to cart");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const removeCartMutation = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData(["cart"]);
      const item = cached?.items?.find(
        (cartItem) => cartItem.product_id === product.uid,
      );
      if (!item) return Promise.resolve();
      return removeCartItem(item.uid);
    },
    onSuccess: () => {
      setMessage("Product removed from cart");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const addToCart = () => {
    setMessage("");
    if (!isLoggedIn) {
      if (isGuestInCart) {
        removeFromGuestCart(product.uid);
        setMessage("Product removed from cart");
      } else {
        addToGuestCart(product.uid, 1);
        setMessage("Product added to cart");
      }
      return;
    }
    if (inCart) {
      removeCartMutation.mutate();
      return;
    }
    cartMutation.mutate();
  };

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white p-2.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-float sm:p-3">
      <Link
        to={`/p/${product.slug}`}
        className="relative block overflow-hidden rounded-lg bg-slate-100"
      >
        <img
          src={productImage(product)}
          alt={product.title}
          width="640"
          height="610"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            if (!e.currentTarget.dataset.errored) {
              e.currentTarget.dataset.errored = "1";
              // Local SVG placeholder — zero network, always visible.
              e.currentTarget.src = generateProductPlaceholderSvg(
                product.slug || product.uid || "product",
                product.title,
              );
            }
          }}
          className="aspect-[1.05] w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">
            Sold out
          </span>
        )}
      </Link>
      <div className="flex min-h-0 flex-1 flex-col px-1 pt-2">
        <p className="mb-1 truncate text-xs text-muted">
          {product.vendor?.store_name || "Tavilo store"}
        </p>
        <Link
          to={`/p/${product.slug}`}
          className="truncate text-sm font-semibold leading-5 text-ink hover:text-brand-600"
        >
          {product.title}
        </Link>
        <div className="mt-1">
          <Rating value={product.rating_avg} count={product.rating_count} compact />
        </div>
        <div className="pt-1">
          <ProductPrice price={product.price} mrp={product.mrp} />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label={inCart ? "Remove from cart" : "Add to cart"}
              aria-pressed={inCart}
              title={inCart ? "Remove from cart" : "Add to cart"}
              onClick={addToCart}
              disabled={
                (!product.is_available && !inCart) ||
                cartMutation.isPending ||
                removeCartMutation.isPending
              }
              className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                inCart
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.16)] hover:border-emerald-700 hover:bg-emerald-700"
                  : "border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300 hover:bg-brand-100"
              }`}
            >
              {inCart ? (
                <Check size={18} strokeWidth={3} />
              ) : (
                <ShoppingBag size={18} strokeWidth={2.25} />
              )}
              <span>{inCart ? "In cart" : "Add to cart"}</span>
            </button>
            <button
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              title={saved ? "Remove from wishlist" : "Add to wishlist"}
              onClick={toggleWishlist}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
                saved
                  ? "border-red-200 bg-red-50 text-red-500"
                  : "border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              } disabled:opacity-40`}
              disabled={wishlistMutation.isPending}
            >
              <Heart size={19} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-1 truncate text-[11px] text-muted" role="status">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}

export default memo(ProductCard);
