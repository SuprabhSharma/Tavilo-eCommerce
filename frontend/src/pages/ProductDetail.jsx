import { useRef, useState } from "react";
import { Heart, MapPin, ShoppingBag, ShoppingCart, Store, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getProduct,
  listProducts,
} from "../api/catalog";
import {
  addCartItem,
  addWishlist,
  getCart,
  getWishlist,
  removeCartItem,
  removeWishlist,
} from "../api/shop";
import { BackLink } from "../components/Page";
import ProductCard from "../components/ProductCard";
import ProductPrice from "../components/ProductPrice";
import ProductGallery from "../components/ProductGallery";
import { Badge, Button, ErrorState, Rating, Skeleton } from "../components/ui";
import FeedbackSection from "../components/FeedbackSection";
import { productImage } from "../lib/formatters";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";
import { getErrorMessage } from "../lib/errors";

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cartError, setCartError] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [wishlistMessage, setWishlistMessage] = useState("");
  // Ref-guard: prevents double-fire on rapid Buy Now / Add to Cart clicks
  const actionInFlight = useRef(false);
  const isLoggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const guestWishlistItems = useGuestStore((state) => state.wishlist.items);
  const guestCartItems = useGuestStore((state) => state.cart.items);
  const addToGuestCart = useGuestStore((state) => state.addToGuestCart);
  const removeFromGuestCart = useGuestStore((state) => state.removeFromGuestCart);
  const addToGuestWishlist = useGuestStore((state) => state.addToGuestWishlist);
  const removeFromGuestWishlist = useGuestStore((state) => state.removeFromGuestWishlist);
  const productQuery = useQuery({ queryKey: ["product", slug], queryFn: () => getProduct(slug) });
  const product = productQuery.data;
  const wishlistQuery = useQuery({ queryKey: ["wishlist"], queryFn: getWishlist, enabled: isLoggedIn });
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: getCart, enabled: isLoggedIn });
  const related = useQuery({
    queryKey: ["products", { vendor: product?.vendor?.slug, page_size: 4 }],
    queryFn: () => listProducts({ vendor: product.vendor.slug, page_size: 4 }),
    enabled: Boolean(product?.vendor?.slug),
  });

  // ── Add to Cart mutation (accumulates qty, optimistic update) ──────────────
  const cart = useMutation({
    mutationFn: (qty = 1) => addCartItem(product.uid, qty),
    onMutate: async (qty = 1) => {
      // Optimistic: cancel outgoing refetches, snapshot, and immediately
      // inject this product into the cached cart so inCart flips instantly.
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previous = queryClient.getQueryData(["cart"]);
      queryClient.setQueryData(["cart"], (old) => {
        if (!old) return old;
        const alreadyIn = old.items?.some((i) => i.product_id === product.uid);
        if (alreadyIn) return old;
        return {
          ...old,
          items: [
            ...(old.items ?? []),
            {
              uid: "optimistic-" + product.uid,
              product_id: product.uid,
              quantity: qty,
              unit_price: product.price,
              line_total: product.price * qty,
              product_title: product.title,
              product,
            },
          ],
        };
      });
      return { previous };
    },
    onSuccess: (data) => {
      // Replace optimistic data with authoritative server response
      queryClient.setQueryData(["cart"], data);
      setCartError("");
      setCartMessage("Product added to cart");
    },
    onError: (error, _vars, context) => {
      // Roll back optimistic update on error
      if (context?.previous) queryClient.setQueryData(["cart"], context.previous);
      setCartError(getErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  const removeCart = useMutation({
    mutationFn: () => {
      const item = cartQuery.data?.items?.find((cartItem) => cartItem.product_id === product.uid);
      return item ? removeCartItem(item.uid) : Promise.resolve();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previous = queryClient.getQueryData(["cart"]);
      // Optimistic: remove from cache immediately
      queryClient.setQueryData(["cart"], (old) => {
        if (!old) return old;
        return { ...old, items: (old.items ?? []).filter((i) => i.product_id !== product.uid) };
      });
      return { previous };
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(["cart"], data);
      setCartMessage("Product removed from cart");
      setCartError("");
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["cart"], context.previous);
      setCartError(getErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  const wishlist = useMutation({
    mutationFn: (saved) => (saved ? removeWishlist(product.uid) : addWishlist(product.uid)),
    onSuccess: (_, wasSaved) => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setWishlistMessage(wasSaved ? "Product removed from wishlist" : "Product added to wishlist");
    },
    onError: (error) => setWishlistMessage(getErrorMessage(error)),
  });
  const inCart = isLoggedIn
    ? Boolean(cartQuery.data?.items?.some((item) => item.product_id === product?.uid))
    : Boolean(guestCartItems.some((i) => i.productId === product?.uid));

  const saved = isLoggedIn
    ? Boolean(wishlistQuery.data?.items?.some((item) => item.product_id === product?.uid))
    : Boolean(guestWishlistItems.some((i) => i.productId === product?.uid));

  if (productQuery.isLoading)
    return <div className="mx-auto max-w-7xl px-4 py-8"><Skeleton className="h-5 w-20" /><div className="mt-8 grid gap-8 md:grid-cols-2"><Skeleton className="aspect-square" /><div><Skeleton className="h-8 w-3/4" /><Skeleton className="mt-5 h-12 w-1/3" /></div></div></div>;
  if (productQuery.isError)
    return <div className="mx-auto max-w-7xl px-4 py-10"><ErrorState onRetry={productQuery.refetch} /></div>;

  const toggleWishlist = () => {
    setWishlistMessage("");
    if (!isLoggedIn) {
      if (saved) {
        removeFromGuestWishlist(product.uid);
        setWishlistMessage("Product removed from wishlist");
      } else {
        addToGuestWishlist(product.uid);
        setWishlistMessage("Product added to wishlist");
      }
      return;
    }
    wishlist.mutate(saved);
  };

  /**
   * Add to Cart handler:
   * - Adds 1 of product to cart.
   * - If already in cart: navigates to /cart.
   */
  const add = () => {
    if (actionInFlight.current) return;
    if (!inCart && (!product?.is_available || (product?.available_stock ?? 1) <= 0)) {
      setCartError("This product is currently out of stock.");
      return;
    }
    setCartError("");
    setCartMessage("");
    if (!isLoggedIn) {
      if (inCart) {
        navigate("/cart");
      } else {
        addToGuestCart(product.uid, 1);
        setCartMessage("Product added to cart");
      }
      return;
    }
    if (inCart) {
      navigate("/cart");
      return;
    }
    actionInFlight.current = true;
    cart.mutate(1, {
      onSettled: () => { actionInFlight.current = false; },
    });
  };

  /**
   * Direct Buy Now handler — Production Flipkart/Amazon Model:
   * - Does NOT alter, overwrite, or clear the user's persistent Cart!
   * - Directs immediately to Checkout with this product (quantity defaults to 1).
   * - Quantity can be adjusted directly on the checkout page before placing the order.
   * - All other cart items remain untouched.
   */
  const buy = () => {
    if (actionInFlight.current) return;
    if (!product?.is_available || (product?.available_stock ?? 1) <= 0) {
      setCartError("This product is currently out of stock.");
      return;
    }
    setCartError("");
    setCartMessage("");
    const directBuyItem = {
      product,
      product_id: product.uid,
      quantity: 1,
    };
    try {
      sessionStorage.setItem("direct_buy_item", JSON.stringify(directBuyItem));
    } catch {}

    if (!isLoggedIn) {
      navigate("/account?next=/checkout", { state: { directBuy: directBuyItem } });
      return;
    }
    navigate("/checkout", { state: { directBuy: directBuyItem } });
  };
  const defaultAddress = null;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BackLink />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <ProductGallery images={product.images} fallback={productImage(product)} alt={product.title} showLightbox />
        <div>
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">{product.vendor?.store_name}</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.title}</h1></div><button aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} title={saved ? "Remove from wishlist" : "Add to wishlist"} onClick={toggleWishlist} disabled={wishlist.isPending} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${saved ? "border-red-200 bg-red-50 text-red-500" : "border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500"} disabled:opacity-40`}><Heart size={21} fill={saved ? "currentColor" : "none"} /></button></div>
          {wishlistMessage && <p className="mt-2 text-sm text-muted" role="status">{wishlistMessage}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Rating value={product.rating_avg} count={product.rating_count} />
            {product.is_available ? <Badge tone="success">In stock</Badge> : <Badge tone="danger">Out of stock</Badge>}
            {product.is_available &&
              typeof product.available_stock === "number" &&
              product.available_stock > 0 &&
              product.available_stock <= 5 &&
              (product.max_order_qty == null || product.available_stock < product.max_order_qty) && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Only {product.available_stock} left
                </span>
              )}
            {product.is_available && product.max_order_qty != null && (
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                Max {product.max_order_qty} per order
              </span>
            )}
          </div>
          <ProductPrice price={product.price} mrp={product.mrp} inline className="mt-6" />
          <div className="mt-5 rounded-lg border border-line bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MapPin size={17} className="text-brand-600" />Delivery</div>{defaultAddress ? <p className="mt-2 text-sm text-muted">Deliver to <strong className="text-ink">{defaultAddress.name}</strong> · {defaultAddress.city}, {defaultAddress.pincode}</p> : <p className="mt-2 text-sm text-muted">Sign in at checkout to add or select a delivery address.</p>}<Link to={isLoggedIn ? "/checkout" : "/account?next=/checkout"} className="mt-2 inline-block text-sm font-semibold text-brand-600">{defaultAddress ? "Change address" : "Add delivery address"}</Link></div>
          <div className="my-7 h-px bg-line" /><p className="whitespace-pre-line text-sm leading-7 text-muted">{product.description || "A carefully selected product from one of our trusted Tavilo stores."}</p>
          {product.attributes && <div className="mt-6 grid grid-cols-2 gap-3">{Object.entries(product.attributes).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs capitalize text-muted">{key.replace("_", " ")}</p><p className="mt-1 text-sm font-semibold">{String(value)}</p></div>)}</div>}

          {/* ── Add to Cart / Go to Cart + Buy Now ──────────────────────────── */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Add to Cart: becomes "Go to cart" once item is in cart */}
            <Button
              className={`flex-1 sm:flex-none ${inCart ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-600 hover:bg-brand-700"}`}
              disabled={(!product.is_available && !inCart) || cart.isPending}
              loading={cart.isPending}
              onClick={add}
            >
              {inCart ? <ShoppingCart size={19} strokeWidth={2.25} /> : <ShoppingBag size={19} strokeWidth={2.25} />}
              {inCart ? "Go to cart" : "Add to cart"}
            </Button>

            {/* Direct Buy Now: isolated from cart, preserves existing cart items */}
            <Button
              className="flex-1 sm:flex-none bg-[#fb641b] hover:bg-[#e85a14] text-white font-bold border-[#fb641b] shadow-sm"
              disabled={!product.is_available}
              onClick={buy}
            >
              <Zap size={17} className="fill-current" />
              Buy now
            </Button>
          </div>
          {cartMessage && <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">{cartMessage}</p>}
          {cartError && <p className="mt-3 text-sm text-red-600" role="alert">{cartError}</p>}
          <Link to={`/store/${product.vendor?.slug}`} className="mt-7 flex items-center gap-3 rounded-card border border-line p-4 hover:border-brand-100"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600"><Store size={18} /></span><div><p className="text-xs text-muted">Sold by</p><p className="text-sm font-semibold">{product.vendor?.store_name}</p></div><span className="ml-auto text-sm font-semibold text-brand-600">Visit store</span></Link>
        </div>
      </div>
      <FeedbackSection product={product} slug={slug} isLoggedIn={isLoggedIn} navigate={navigate} />
      {related.data?.items?.length > 0 && <section className="mt-14 border-t border-line pt-10"><h2 className="mb-5 text-xl font-bold">More from {product.vendor?.store_name}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{related.data.items.filter((item) => item.uid !== product.uid).map((item) => <ProductCard key={item.uid} product={item} />)}</div></section>}
    </div>
  );
}
