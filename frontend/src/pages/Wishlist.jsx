import { useMemo } from "react";
import { Heart, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  addCartItem,
  getCart,
  getProductsByIds,
  getWishlist,
  removeWishlist,
} from "../api/shop";
import { Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import ProductPrice from "../components/ProductPrice";
import ProductImage from "../components/ProductImage";
import { imageVariant, productImage } from "../lib/formatters";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";

export default function Wishlist() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isReady = useAuthStore((state) => state.isReady);
  const loggedIn = Boolean(accessToken);

  // ── Authenticated Wishlist & Cart ──────────────────────────────────────────
  const authQuery = useQuery({
    queryKey: ["wishlist"],
    queryFn: getWishlist,
    enabled: loggedIn,
  });

  const authCartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: loggedIn,
  });

  const authRemoveMutation = useMutation({
    mutationFn: removeWishlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
  });

  const authAddToCartMutation = useMutation({
    mutationFn: ({ productId }) => addCartItem(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });

  // ── Guest Wishlist & Cart ─────────────────────────────────────────────────
  const guestWishlistItems = useGuestStore((state) => state.wishlist.items);
  const guestCartItems = useGuestStore((state) => state.cart.items);
  const removeFromGuestWishlist = useGuestStore(
    (state) => state.removeFromGuestWishlist,
  );
  const addToGuestCart = useGuestStore((state) => state.addToGuestCart);

  const authCartIds = useMemo(
    () => new Set((authCartQuery.data?.items || []).map((i) => i.product_id)),
    [authCartQuery.data],
  );

  const guestProductIds = useMemo(
    () => guestWishlistItems.map((i) => i.productId),
    [guestWishlistItems],
  );

  const guestProductsQuery = useQuery({
    queryKey: ["guest-wishlist-products", guestProductIds],
    queryFn: () => getProductsByIds(guestProductIds),
    enabled: !loggedIn && guestProductIds.length > 0,
  });

  // Construct items
  const items = useMemo(() => {
    if (loggedIn) {
      return (authQuery.data?.items || []).map((item) => ({
        uid: item.uid,
        product_id: item.product_id,
        product_title: item.product_title,
        product_slug: item.product_slug,
        created_at: item.created_at,
        product: item.product,
      }));
    }

    const productMap = new Map();
    for (const p of guestProductsQuery.data?.items || []) {
      productMap.set(p.uid, p);
    }

    return guestWishlistItems
      .map((gItem) => {
        const product = productMap.get(gItem.productId);
        if (!product) return null;
        return {
          uid: gItem.productId,
          product_id: gItem.productId,
          product_title: product.title,
          product_slug: product.slug,
          created_at: gItem.addedAt,
          product,
        };
      })
      .filter(Boolean);
  }, [
    loggedIn,
    authQuery.data?.items,
    guestWishlistItems,
    guestProductsQuery.data?.items,
  ]);

  const isLoading = !isReady || (loggedIn
    ? authQuery.isLoading
    : guestProductIds.length > 0 && guestProductsQuery.isLoading);

  const isError = loggedIn ? authQuery.isError : guestProductsQuery.isError;
  const refetch = loggedIn ? authQuery.refetch : guestProductsQuery.refetch;

  if (isLoading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-8 h-40" />
      </div>
    );

  if (isError)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState onRetry={refetch} />
      </div>
    );

  const handleRemove = (productId) => {
    if (loggedIn) {
      authRemoveMutation.mutate(productId);
    } else {
      removeFromGuestWishlist(productId);
    }
  };

  const handleAddToCart = (product) => {
    if (loggedIn) {
      authAddToCartMutation.mutate({ productId: product.uid });
    } else {
      addToGuestCart(product.uid, 1);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Heart className="text-brand-600" />
        <h1 className="text-2xl font-bold">Wishlist</h1>
      </div>

      {!items.length ? (
        <div className="mt-8">
          <EmptyState
            title="Your wishlist is empty"
            description="Save products you want to come back to."
            action={
              <Link to="/products">
                <Button>Explore products</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 divide-y divide-line rounded-card border border-line bg-white">
          {items.map((item) => (
            <div
              key={item.uid}
              className="flex items-center gap-4 p-4"
            >
              <Link
                to={`/p/${item.product_slug || item.product?.slug}`}
                className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-slate-100 transition hover:opacity-90"
              >
                <ProductImage
                  src={imageVariant(productImage(item.product), 160)}
                  alt={item.product_title || ""}
                  width="72"
                  height="72"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </Link>
              <Link to={`/p/${item.product_slug}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold hover:text-brand-600">
                  {item.product_title}
                </p>
                <ProductPrice
                  price={item.product?.price}
                  mrp={item.product?.mrp}
                  className="mt-1 text-sm"
                />
                <p className="mt-1 text-xs text-muted">
                  Saved on{" "}
                  {new Date(item.created_at).toLocaleDateString("en-IN")}
                </p>
              </Link>
              <div className="ml-auto flex shrink-0 gap-2">
                {(() => {
                  const inCart = loggedIn
                    ? authCartIds.has(item.product_id)
                    : guestCartItems.some((i) => i.productId === item.product_id);
                  return (
                    <button
                      aria-label={inCart ? `Go to cart (${item.product_title})` : `Add ${item.product_title} to cart`}
                      onClick={() => (inCart ? navigate("/cart") : handleAddToCart(item.product))}
                      disabled={
                        (!item.product?.is_available && !inCart) ||
                        (loggedIn && authAddToCartMutation.isPending)
                      }
                      className={`grid h-10 w-10 place-items-center rounded-lg transition ${
                        inCart
                          ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          : "text-brand-600 hover:bg-brand-50"
                      } disabled:opacity-40`}
                      title={inCart ? "Go to cart" : "Add to cart"}
                    >
                      {inCart ? <ShoppingCart size={17} strokeWidth={2.2} /> : <ShoppingBag size={17} />}
                    </button>
                  );
                })()}
                <button
                  aria-label={`Remove ${item.product_title}`}
                  onClick={() => handleRemove(item.product_id)}
                  disabled={loggedIn && authRemoveMutation.isPending}
                  className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  title="Remove from wishlist"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
