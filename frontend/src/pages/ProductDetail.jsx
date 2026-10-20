import { useState } from "react";
import { Check, Heart, MapPin, MessageCircleHeart, Pencil, ShieldCheck, ShoppingBag, Star, Store, Trash2, X, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createReview,
  deleteReview,
  getProduct,
  getReviewStatus,
  listProducts,
  listReviews,
  updateReview,
} from "../api/catalog";
import {
  addCartItem,
  addWishlist,
  getCart,
  getAddresses,
  getWishlist,
  removeCartItem,
  removeWishlist,
} from "../api/shop";
import { BackLink } from "../components/Page";
import ProductCard from "../components/ProductCard";
import ProductPrice from "../components/ProductPrice";
import ProductGallery from "../components/ProductGallery";
import { Badge, Button, ErrorState, Rating, Skeleton } from "../components/ui";
import { productImage } from "../lib/formatters";
import { useAuthStore } from "../store/authStore";
import { getErrorMessage } from "../lib/errors";

function StarPicker({ value = 0, onChange, interactive = false, label = "Rating" }) {
  const [hovered, setHovered] = useState(0);
  const visibleValue = hovered || value;
  const stars = Array.from({ length: 5 }, (_, index) => index + 1);

  return (
    <div
      className="inline-flex items-center gap-1"
      role={interactive ? "radiogroup" : undefined}
      aria-label={label}
      onMouseLeave={() => interactive && setHovered(0)}
    >
      {stars.map((star) => {
        const active = star <= visibleValue;
        const content = (
          <Star
            size={interactive ? 31 : 17}
            strokeWidth={1.8}
            fill={active ? "currentColor" : "none"}
            className={active ? "text-amber-400 drop-shadow-[0_2px_3px_rgba(245,158,11,0.28)] transition duration-150" : "text-slate-300 transition duration-150"}
          />
        );
        if (!interactive) return <span key={star}>{content}</span>;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-label={star + " star" + (star === 1 ? "" : "s")}
            aria-checked={value === star}
            className="group rounded-md p-1 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1"
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onClick={() => onChange(star)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [cartAdded, setCartAdded] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [wishlistMessage, setWishlistMessage] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [editingReview, setEditingReview] = useState(null);
  const [writingReview, setWritingReview] = useState(false);
  const [confirmRemoveReview, setConfirmRemoveReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const isLoggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const productQuery = useQuery({ queryKey: ["product", slug], queryFn: () => getProduct(slug) });
  const product = productQuery.data;
  const wishlistQuery = useQuery({ queryKey: ["wishlist"], queryFn: getWishlist, enabled: isLoggedIn });
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: getAddresses, enabled: isLoggedIn });
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: getCart, enabled: isLoggedIn });
  const reviews = useQuery({ queryKey: ["reviews", slug], queryFn: () => listReviews(slug), enabled: Boolean(product) });
  const reviewStatus = useQuery({
    queryKey: ["review-status", slug],
    queryFn: () => getReviewStatus(slug),
    enabled: Boolean(product) && isLoggedIn,
  });
  const related = useQuery({
    queryKey: ["products", { vendor: product?.vendor?.slug, page_size: 4 }],
    queryFn: () => listProducts({ vendor: product.vendor.slug, page_size: 4 }),
    enabled: Boolean(product?.vendor?.slug),
  });
  const queryClient = useQueryClient();
  const cart = useMutation({
    mutationFn: () => addCartItem(product.uid),
    onSuccess: () => {
      setCartError("");
      setCartMessage("Product added to cart");
      setCartAdded(true);
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) => {
      setCartAdded(false);
      setCartError(getErrorMessage(error));
    },
  });
  const removeCart = useMutation({
    mutationFn: () => {
      const item = cartQuery.data?.items?.find((cartItem) => cartItem.product_id === product.uid);
      return item ? removeCartItem(item.uid) : Promise.resolve();
    },
    onSuccess: () => {
      setCartAdded(false);
      setCartMessage("Product removed from cart");
      setCartError("");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) => setCartError(getErrorMessage(error)),
  });
  const buyNow = useMutation({
    mutationFn: () => addCartItem(product.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      navigate(isLoggedIn ? "/checkout" : "/account?next=/checkout");
    },
    onError: (error) => setCartError(getErrorMessage(error)),
  });
  const wishlist = useMutation({
    mutationFn: (saved) => (saved ? removeWishlist(product.uid) : addWishlist(product.uid)),
    onSuccess: (_, wasSaved) => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      setWishlistMessage(wasSaved ? "Product removed from wishlist" : "Product added to wishlist");
    },
    onError: (error) => setWishlistMessage(getErrorMessage(error)),
  });
  const reviewMutation = useMutation({
    mutationFn: (payload) =>
      editingReview
        ? updateReview(product.uid, editingReview.uid, payload)
        : createReview(product.uid, payload),
    onSuccess: () => {
      setReviewMessage(editingReview ? "Review updated successfully." : "Review submitted successfully.");
      setReviewError("");
      setEditingReview(null);
      setWritingReview(false);
      setReviewRating(0);
      setReviewText("");
      queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
      queryClient.invalidateQueries({ queryKey: ["review-status", slug] });
      queryClient.invalidateQueries({ queryKey: ["product", slug] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      setReviewMessage("");
      setReviewError(getErrorMessage(error));
    },
  });
  const removeReview = useMutation({
    mutationFn: () => deleteReview(product.uid, reviewStatus.data.review.uid),
    onSuccess: () => {
      setReviewMessage("Feedback removed successfully.");
      setReviewError("");
      setConfirmRemoveReview(false);
      queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
      queryClient.invalidateQueries({ queryKey: ["review-status", slug] });
      queryClient.invalidateQueries({ queryKey: ["product", slug] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      setReviewMessage("");
      setReviewError(getErrorMessage(error));
    },
  });
  if (productQuery.isLoading)
    return <div className="mx-auto max-w-7xl px-4 py-8"><Skeleton className="h-5 w-20" /><div className="mt-8 grid gap-8 md:grid-cols-2"><Skeleton className="aspect-square" /><div><Skeleton className="h-8 w-3/4" /><Skeleton className="mt-5 h-12 w-1/3" /></div></div></div>;
  if (productQuery.isError)
    return <div className="mx-auto max-w-7xl px-4 py-10"><ErrorState onRetry={productQuery.refetch} /></div>;
  const inCart = cartAdded || Boolean(cartQuery.data?.items?.some((item) => item.product_id === product.uid));
  const saved = Boolean(wishlistQuery.data?.items?.some((item) => item.product_id === product.uid));
  const toggleWishlist = () => {
    if (!isLoggedIn) {
      navigate(`/account?next=${encodeURIComponent(`/p/${slug}`)}`);
      return;
    }
    setWishlistMessage("");
    wishlist.mutate(saved);
  };
  const add = () => {
    setCartError("");
    setCartMessage("");
    if (!isLoggedIn) {
      navigate(`/account?next=${encodeURIComponent(`/p/${slug}`)}`);
      return;
    }
    if (inCart) removeCart.mutate();
    else cart.mutate();
  };
  const buy = () => {
    setCartError("");
    setCartMessage("");
    if (!isLoggedIn) navigate("/account?next=/checkout");
    else buyNow.mutate();
  };
  const openNewReview = () => {
    setEditingReview(null);
    setWritingReview(true);
    setConfirmRemoveReview(false);
    setReviewRating(0);
    setReviewText("");
    setReviewMessage("");
    setReviewError("");
  };
  const openEditReview = (review) => {
    setEditingReview(review);
    setWritingReview(false);
    setConfirmRemoveReview(false);
    setReviewRating(review.rating);
    setReviewText(review.review_text);
    setReviewMessage("");
    setReviewError("");
  };
  const submitReview = (event) => {
    event.preventDefault();
    const text = reviewText.trim();
    if (!reviewRating || !text) {
      setReviewError("Choose a star rating and write a short review before submitting.");
      return;
    }
    setReviewError("");
    reviewMutation.mutate({ rating: reviewRating, review_text: text });
  };
  const defaultAddress = addresses.data?.find((address) => address.is_default) || addresses.data?.[0];
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BackLink />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <ProductGallery images={product.images} fallback={productImage(product)} alt={product.title} showLightbox />
        <div>
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">{product.vendor?.store_name}</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.title}</h1></div><button aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} title={saved ? "Remove from wishlist" : "Add to wishlist"} onClick={toggleWishlist} disabled={wishlist.isPending} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${saved ? "border-red-200 bg-red-50 text-red-500" : "border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500"} disabled:opacity-40`}><Heart size={21} fill={saved ? "currentColor" : "none"} /></button></div>
          {wishlistMessage && <p className="mt-2 text-sm text-muted" role="status">{wishlistMessage}</p>}
          <div className="mt-4 flex items-center gap-3"><Rating value={product.rating_avg} count={product.rating_count} />{product.stock > 0 ? <Badge tone="success">In stock</Badge> : <Badge tone="danger">Out of stock</Badge>}</div>
          <ProductPrice price={product.price} mrp={product.mrp} inline className="mt-6" />
          <div className="mt-5 rounded-lg border border-line bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MapPin size={17} className="text-brand-600" />Delivery</div>{defaultAddress ? <p className="mt-2 text-sm text-muted">Deliver to <strong className="text-ink">{defaultAddress.name}</strong> · {defaultAddress.city}, {defaultAddress.pincode}</p> : <p className="mt-2 text-sm text-muted">Sign in at checkout to add or select a delivery address.</p>}<Link to={isLoggedIn ? "/checkout" : "/account?next=/checkout"} className="mt-2 inline-block text-sm font-semibold text-brand-600">{defaultAddress ? "Change address" : "Add delivery address"}</Link></div>
          <div className="my-7 h-px bg-line" /><p className="whitespace-pre-line text-sm leading-7 text-muted">{product.description || "A carefully selected product from one of our trusted Tavilo stores."}</p>
          {product.attributes && <div className="mt-6 grid grid-cols-2 gap-3">{Object.entries(product.attributes).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs capitalize text-muted">{key.replace("_", " ")}</p><p className="mt-1 text-sm font-semibold">{String(value)}</p></div>)}</div>}
          <div className="mt-8 flex flex-wrap items-center gap-3"><Button className={`flex-1 sm:flex-none ${inCart ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-600 hover:bg-brand-700"}`} disabled={(!product.stock && !inCart) || cart.isPending || removeCart.isPending} loading={cart.isPending || removeCart.isPending} onClick={add}>{inCart ? <Check size={19} strokeWidth={3} /> : <ShoppingBag size={19} strokeWidth={2.25} />}{inCart ? "In cart" : "Add to cart"}</Button><Button className="flex-1 sm:flex-none" disabled={!product.stock || buyNow.isPending} loading={buyNow.isPending} onClick={buy}><Zap size={17} />Buy now</Button></div>
          {cartMessage && <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">{cartMessage}</p>}{cartError && <p className="mt-3 text-sm text-red-600">{cartError}</p>}
          <Link to={`/store/${product.vendor?.slug}`} className="mt-7 flex items-center gap-3 rounded-card border border-line p-4 hover:border-brand-100"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600"><Store size={18} /></span><div><p className="text-xs text-muted">Sold by</p><p className="text-sm font-semibold">{product.vendor?.store_name}</p></div><span className="ml-auto text-sm font-semibold text-brand-600">Visit store</span></Link>
        </div>
      </div>
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="customer-feedback-title">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(16,40,75,0.08)]">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-100/70 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-amber-100/60 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                <ShieldCheck size={15} />
                Verified customer feedback
              </span>
              <h2 id="customer-feedback-title" className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Customer feedback
              </h2>
              <div className="mt-5 flex items-center gap-4">
                <span className="text-5xl font-extrabold tracking-tight text-ink">{Number(product.rating_avg || 0).toFixed(1)}</span>
                <div>
                  <StarPicker value={Math.round(Number(product.rating_avg || 0))} />
                  <p className="mt-1 text-sm text-muted">
                    {product.rating_count
                      ? product.rating_count + " delivered-customer rating" + (product.rating_count === 1 ? "" : "s")
                      : "No delivered-customer ratings yet"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/15">
              {!isLoggedIn ? (
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className="mt-3 text-lg font-bold">Share feedback after delivery</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Sign in to see whether this delivered purchase is ready for feedback.</p>
                  <Button className="mt-5 bg-white text-ink hover:bg-brand-50" onClick={() => navigate("/account?next=" + encodeURIComponent("/p/" + slug))}>
                    Sign in to continue
                  </Button>
                </>
              ) : reviewStatus.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-36 bg-slate-700" />
                  <Skeleton className="h-10 w-full bg-slate-800" />
                </div>
              ) : editingReview || writingReview ? (
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className="mt-3 text-lg font-bold">Feedback in progress</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Your rating and message are ready just below.</p>
                  <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-200 transition hover:text-white" onClick={() => { setEditingReview(null); setWritingReview(false); }}>
                    <X size={16} />
                    Close feedback form
                  </button>
                </>
              ) : reviewStatus.data?.can_review && !reviewStatus.data?.review ? (
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className="mt-3 text-lg font-bold">How did it go?</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Your delivery is verified. A quick rating helps the next customer.</p>
                  <Button className="mt-5 bg-brand-400 text-slate-950 hover:bg-brand-300" onClick={openNewReview}>
                    Give your feedback
                  </Button>
                </>
              ) : reviewStatus.data?.review ? (
                <>
                  <Check size={25} className="text-emerald-300" />
                  <h3 className="mt-3 text-lg font-bold">Feedback received</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Thank you for helping other shoppers.</p>
                </>
              ) : (
                <>
                  <ShieldCheck size={25} className="text-slate-300" />
                  <h3 className="mt-3 text-lg font-bold">Feedback unlocks after delivery</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Once this item is marked delivered, you will be able to give your feedback here.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {editingReview || writingReview ? (
          <form onSubmit={submitReview} className="mt-5 overflow-hidden rounded-[24px] border border-brand-100 bg-white shadow-[0_14px_40px_rgba(11,181,176,0.10)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-200">
                  <MessageCircleHeart size={20} />
                </span>
                <div>
                  <h3 className="font-bold text-ink">{editingReview ? "Update your feedback" : "Give your feedback"}</h3>
                </div>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100">Delivered purchase</span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-ink">Your rating</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2">
                  <StarPicker value={reviewRating} onChange={setReviewRating} interactive label="Choose a rating from 1 to 5 stars" />
                  <span className="min-w-8 text-right text-sm font-extrabold text-amber-700">{reviewRating || "–"}</span>
                </div>
              </div>
              <label className="mt-6 block">
                <span className="text-sm font-bold text-ink">Tell us more</span>
                <textarea
                  value={reviewText}
                  onChange={(event) => setReviewText(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Share your experience"
                  className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50/60 p-4 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  aria-label="Your feedback"
                />
              </label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted">{reviewText.length}/2000</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => { setEditingReview(null); setWritingReview(false); }} disabled={reviewMutation.isPending}>Cancel</Button>
                  <Button type="submit" loading={reviewMutation.isPending}>{editingReview ? "Save changes" : "Submit feedback"}</Button>
                </div>
              </div>
            </div>
          </form>
        ) : null}

        {reviewStatus.data?.review && !editingReview ? (
          <div className="mt-5 rounded-[22px] border border-emerald-100 bg-emerald-50/50 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                    <Check size={13} />
                    Your feedback
                  </span>
                  <StarPicker value={reviewStatus.data.review.rating} />
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">{reviewStatus.data.review.review_text}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openEditReview(reviewStatus.data.review)} className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-600 ring-1 ring-emerald-100 transition hover:bg-emerald-100 hover:text-emerald-800" aria-label="Edit your feedback" title="Edit your feedback">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => setConfirmRemoveReview(true)} className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-emerald-100 transition hover:bg-red-50 hover:text-red-600" aria-label="Remove your feedback" title="Remove your feedback">
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            {confirmRemoveReview ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-white p-3">
                <p className="text-sm font-medium text-slate-700">Remove this feedback?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmRemoveReview(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100">Keep it</button>
                  <Button variant="danger" loading={removeReview.isPending} onClick={() => removeReview.mutate()}>Remove</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {reviewMessage ? <p className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{reviewMessage}</p> : null}
        {reviewError ? <p className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{reviewError}</p> : null}

        <div className="mt-9 flex items-center gap-4">
          <h3 className="text-lg font-bold text-ink">Latest feedback</h3>
          <span className="h-px flex-1 bg-line" />
        </div>
        {reviews.data?.length > 0 ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.data.slice(0, 6).map((review) => (
              <article key={review.uid} className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <StarPicker value={review.rating} />
                  <ShieldCheck size={17} className="text-emerald-500" aria-label="Verified delivery" />
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{review.review_text}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-slate-50 px-6 py-10 text-center">
            <MessageCircleHeart className="mx-auto text-brand-500" size={30} />
            <p className="mt-3 font-bold text-ink">No feedback yet</p>
            <p className="mt-1 text-sm text-muted">Delivered customers will be able to share the first verified experience.</p>
          </div>
        )}
      </section>
      {related.data?.items?.length > 0 && <section className="mt-14 border-t border-line pt-10"><h2 className="mb-5 text-xl font-bold">More from {product.vendor?.store_name}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{related.data.items.filter((item) => item.uid !== product.uid).map((item) => <ProductCard key={item.uid} product={item} />)}</div></section>}
    </div>
  );
}
