import { useEffect, useState } from "react";
import {
  Check,
  MessageCircleHeart,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReview,
  deleteReview,
  getReviewStatus,
  listReviews,
  updateReview,
} from "../api/catalog";
import { Button, Skeleton } from "./ui";
import { subscribeToOrderUpdates } from "../lib/orderSync";
import { getErrorMessage } from "../lib/errors";

// ─────────────────────────────────────────────────────────────────────────────
// Shared className constants (DRY — used in multiple places)
// ─────────────────────────────────────────────────────────────────────────────
const CTA_ICON_BODY_CLS = "mt-1 text-sm leading-6 text-slate-300";
const CTA_HEADING_CLS = "mt-3 text-lg font-bold";

// ─────────────────────────────────────────────────────────────────────────────
// StarPicker — interactive (radiogroup) or display-only (static spans)
// Exported so ProductDetail (or any other consumer) can import it without
// duplicating the implementation.
// ─────────────────────────────────────────────────────────────────────────────
export function StarPicker({
  value = 0,
  onChange,
  interactive = false,
  label = "Rating",
}) {
  const [hovered, setHovered] = useState(0);
  const visibleValue = hovered || value;
  const stars = Array.from({ length: 5 }, (_, index) => index + 1);

  const handleMouseLeave = () => {
    if (interactive) setHovered(0);
  };

  return (
    <div
      className="inline-flex items-center gap-1"
      role={interactive ? "radiogroup" : undefined}
      aria-label={label}
      onMouseLeave={handleMouseLeave}
    >
      {stars.map((star) => {
        const active = star <= visibleValue;
        const starIcon = (
          <Star
            size={interactive ? 31 : 17}
            strokeWidth={1.8}
            fill={active ? "currentColor" : "none"}
            className={
              active
                ? "text-amber-400 drop-shadow-[0_2px_3px_rgba(245,158,11,0.28)] transition duration-150"
                : "text-slate-300 transition duration-150"
            }
          />
        );

        if (!interactive) return <span key={star}>{starIcon}</span>;

        const handleMouseEnter = () => setHovered(star);
        const handleFocus = () => setHovered(star);
        const handleClick = () => onChange(star);

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-label={star + " star" + (star === 1 ? "" : "s")}
            aria-checked={value === star}
            className="group rounded-md p-1 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1"
            onMouseEnter={handleMouseEnter}
            onFocus={handleFocus}
            onClick={handleClick}
          >
            {starIcon}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FeedbackSection — owns ALL feedback state, queries and mutations.
// Props: { product, slug, isLoggedIn, navigate }
// ─────────────────────────────────────────────────────────────────────────────
export default function FeedbackSection({ product, slug, isLoggedIn, navigate }) {
  const queryClient = useQueryClient();

  // ── Local state ────────────────────────────────────────────────────────────
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [editingReview, setEditingReview] = useState(null);
  const [writingReview, setWritingReview] = useState(false);
  const [confirmRemoveReview, setConfirmRemoveReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  // Public — always fetch regardless of auth state
  const reviews = useQuery({
    queryKey: ["reviews", slug],
    queryFn: () => listReviews(slug),
    enabled: Boolean(product),
  });

  // Auth-only — only fires when logged in and product is loaded
  const reviewStatus = useQuery({
    queryKey: ["review-status", slug],
    queryFn: () => getReviewStatus(slug),
    enabled: Boolean(isLoggedIn && product),
    // Eligibility is server-owned. Refetch on focus/reconnect for cross-tab
    // order delivery notifications without polling.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // ── Cross-tab order-sync subscription (logged-in only) ────────────────────
  useEffect(() => {
    if (!isLoggedIn || !slug) return undefined;
    return subscribeToOrderUpdates(() => {
      queryClient.invalidateQueries({ queryKey: ["review-status", slug] });
    });
  }, [isLoggedIn, queryClient, slug]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const reviewMutation = useMutation({
    mutationFn: (payload) =>
      editingReview
        ? updateReview(product.uid, editingReview.uid, payload)
        : createReview(product.uid, payload),
    onSuccess: () => {
      setReviewMessage(
        editingReview ? "Review updated successfully." : "Review submitted successfully.",
      );
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
      // 409 Conflict → user already reviewed (server enforces uniqueness)
      // 403 Forbidden → not a delivered customer
      const status = error?.response?.status;
      if (status === 409) {
        setReviewError("You've already reviewed this product.");
      } else if (status === 403) {
        setReviewError("Only delivered customers can review this product.");
      } else {
        setReviewError(getErrorMessage(error));
      }
    },
  });

  const removeReview = useMutation({
    mutationFn: () =>
      deleteReview(product.uid, reviewStatus.data.review.uid),
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

  // ── Derived state ──────────────────────────────────────────────────────────
  /**
   * showFeedbackAction controls whether the dark CTA card renders.
   * Hidden only when user is logged-in AND ineligible AND has no review.
   * Matches Flipkart: ineligible users don't see any review CTA card.
   */
  const showFeedbackAction =
    !isLoggedIn ||
    reviewStatus.isLoading ||
    reviewStatus.isError ||
    editingReview ||
    writingReview ||
    Boolean(reviewStatus.data?.can_review) ||
    Boolean(reviewStatus.data?.review);

  // ── Named event handlers ───────────────────────────────────────────────────
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

  const closeForm = () => {
    setEditingReview(null);
    setWritingReview(false);
  };

  const cancelForm = () => {
    setEditingReview(null);
    setWritingReview(false);
  };

  const confirmDelete = () => setConfirmRemoveReview(true);
  const cancelDelete = () => setConfirmRemoveReview(false);
  const executeDelete = () => removeReview.mutate();

  const handleSignIn = () =>
    navigate("/account?next=" + encodeURIComponent("/p/" + slug));

  const submitReview = (event) => {
    event.preventDefault();
    const text = reviewText.trim();
    if (!reviewRating || !text) {
      setReviewError(
        "Choose a star rating and write a short review before submitting.",
      );
      return;
    }
    setReviewError("");
    reviewMutation.mutate({ rating: reviewRating, review_text: text });
  };

  const handleReviewTextChange = (event) => setReviewText(event.target.value);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section
      className="mt-14 border-t border-line pt-10"
      aria-labelledby="customer-feedback-title"
    >
      {/* ── Outer card with decorative blurs ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(16,40,75,0.08)]">
        <div
          className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-100/70 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-amber-100/60 blur-3xl"
          aria-hidden="true"
        />

        <div
          className={`relative grid gap-8 p-6 sm:p-8 ${
            showFeedbackAction
              ? "lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
              : "max-w-2xl"
          }`}
        >
          {/* ── Rating summary (identical for all users) ─────────────────── */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              <ShieldCheck size={15} />
              Verified customer feedback
            </span>
            <h2
              id="customer-feedback-title"
              className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl"
            >
              Customer feedback
            </h2>
            <div className="mt-5 flex items-center gap-4">
              <span className="text-5xl font-extrabold tracking-tight text-ink">
                {Number(product.rating_avg || 0).toFixed(1)}
              </span>
              <div>
                <StarPicker value={Math.round(Number(product.rating_avg || 0))} />
                <p className="mt-1 text-sm text-muted">
                  {product.rating_count
                    ? product.rating_count +
                      " delivered-customer rating" +
                      (product.rating_count === 1 ? "" : "s")
                    : "No delivered-customer ratings yet"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Dark CTA card (conditionally rendered, content varies by state) */}
          {showFeedbackAction && (
            <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/15">
              {/* STATE 1: Guest — login CTA */}
              {!isLoggedIn ? (
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className={CTA_HEADING_CLS}>Share feedback after delivery</h3>
                  <p className={CTA_ICON_BODY_CLS}>
                    Sign in to see whether this delivered purchase is ready for feedback.
                  </p>
                  <Button
                    variant="white"
                    className="mt-5 !bg-white !text-slate-900 hover:!bg-slate-100 font-semibold shadow-sm"
                    onClick={handleSignIn}
                  >
                    Sign in to continue
                  </Button>
                </>
              ) : reviewStatus.isLoading ? (
                /* STATE 2: Loading skeleton */
                <div className="space-y-3">
                  <Skeleton className="h-5 w-36 bg-slate-700" />
                  <Skeleton className="h-10 w-full bg-slate-800" />
                </div>
              ) : reviewStatus.isError ? (
                /* STATE 3: Error */
                <>
                  <ShieldCheck size={25} className="text-slate-300" />
                  <h3 className={CTA_HEADING_CLS}>Could not check feedback eligibility</h3>
                  <p className={CTA_ICON_BODY_CLS}>
                    Try again to check whether this delivered purchase is ready for feedback.
                  </p>
                  <button
                    type="button"
                    className="mt-4 text-sm font-bold text-brand-200 underline underline-offset-2"
                    onClick={reviewStatus.refetch}
                  >
                    Try again
                  </button>
                </>
              ) : editingReview || writingReview ? (
                /* STATE 4: Form is open */
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className={CTA_HEADING_CLS}>Feedback in progress</h3>
                  <p className={CTA_ICON_BODY_CLS}>
                    Your rating and message are ready just below.
                  </p>
                  <button
                    type="button"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-200 transition hover:text-white"
                    onClick={closeForm}
                  >
                    <X size={16} />
                    Close feedback form
                  </button>
                </>
              ) : reviewStatus.data?.can_review && !reviewStatus.data?.review ? (
                /* STATE 5: Eligible, no review yet */
                <>
                  <MessageCircleHeart size={25} className="text-brand-200" />
                  <h3 className={CTA_HEADING_CLS}>How did it go?</h3>
                  <p className={CTA_ICON_BODY_CLS}>
                    Your delivery is verified. A quick rating helps the next customer.
                  </p>
                  <Button
                    variant="accent"
                    className="mt-5 !bg-brand-400 !text-slate-950 hover:!bg-brand-300 font-bold"
                    onClick={openNewReview}
                  >
                    Give your feedback
                  </Button>
                </>
              ) : reviewStatus.data?.review ? (
                /* STATE 6: Review already submitted */
                <>
                  <Check size={25} className="text-emerald-300" />
                  <h3 className={CTA_HEADING_CLS}>Feedback received</h3>
                  <p className={CTA_ICON_BODY_CLS}>
                    Thank you for helping other shoppers.
                  </p>
                </>
              ) : null /* STATE 7 (ineligible): showFeedbackAction is false → card hidden above */}
            </div>
          )}
        </div>
      </div>

      {/* ── Review write / edit form (shown only to logged-in eligible users) */}
      {(editingReview || writingReview) && (
        <form
          onSubmit={submitReview}
          className="mt-5 overflow-hidden rounded-[24px] border border-brand-100 bg-white shadow-[0_14px_40px_rgba(11,181,176,0.10)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-200">
                <MessageCircleHeart size={20} />
              </span>
              <div>
                <h3 className="font-bold text-ink">
                  {editingReview ? "Update your feedback" : "Give your feedback"}
                </h3>
              </div>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100">
              Delivered purchase
            </span>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink">Your rating</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2">
                <StarPicker
                  value={reviewRating}
                  onChange={setReviewRating}
                  interactive
                  label="Choose a rating from 1 to 5 stars"
                />
                <span className="min-w-8 text-right text-sm font-extrabold text-amber-700">
                  {reviewRating || "–"}
                </span>
              </div>
            </div>

            <label className="mt-6 block">
              <span className="text-sm font-bold text-ink">Tell us more</span>
              <textarea
                value={reviewText}
                onChange={handleReviewTextChange}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelForm}
                  disabled={reviewMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={reviewMutation.isPending}>
                  {editingReview ? "Save changes" : "Submit feedback"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── "Your feedback" card (logged-in user who has submitted) ─────────── */}
      {reviewStatus.data?.review && !editingReview && (
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
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">
                {reviewStatus.data.review.review_text}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openEditReview(reviewStatus.data.review)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-600 ring-1 ring-emerald-100 transition hover:bg-emerald-100 hover:text-emerald-800"
                aria-label="Edit your feedback"
                title="Edit your feedback"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-emerald-100 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Remove your feedback"
                title="Remove your feedback"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          {confirmRemoveReview && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-white p-3">
              <p className="text-sm font-medium text-slate-700">Remove this feedback?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                >
                  Keep it
                </button>
                <Button
                  variant="danger"
                  loading={removeReview.isPending}
                  onClick={executeDelete}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Review mutation feedback messages ────────────────────────────────── */}
      {reviewMessage && (
        <p
          className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          {reviewMessage}
        </p>
      )}
      {reviewError && (
        <p
          className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {reviewError}
        </p>
      )}

      {/* ── Latest feedback grid ─────────────────────────────────────────────── */}
      <div className="mt-9 flex items-center gap-4">
        <h3 className="text-lg font-bold text-ink">Latest feedback</h3>
        <span className="h-px flex-1 bg-line" />
      </div>

      {reviews.data?.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.data.slice(0, 6).map((review) => (
            <article
              key={review.uid}
              className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-lg"
            >
              <div className="flex items-center justify-between gap-3">
                <StarPicker value={review.rating} />
                <ShieldCheck
                  size={17}
                  className="text-emerald-500"
                  aria-label="Verified delivery"
                />
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {review.review_text}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-line bg-slate-50 px-6 py-10 text-center">
          <MessageCircleHeart className="mx-auto text-brand-500" size={30} />
          <p className="mt-3 font-bold text-ink">No feedback yet</p>
          <p className="mt-1 text-sm text-muted">
            Delivered customers will be able to share the first verified experience.
          </p>
        </div>
      )}
    </section>
  );
}
