import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  addAddress,
  checkout,
  getAddresses,
  getCart,
  removeCartItem,
  updateCartItem,
} from "../api/shop";
import { getLiveProduct } from "../api/catalog";
import { Button, EmptyState, ErrorState, Input, Skeleton } from "../components/ui";
import { formatCurrency, productImage } from "../lib/formatters";
import { getErrorMessage } from "../lib/errors";
import { setLastAddressUid } from "../lib/addressStorage";
import { useAuthStore } from "../store/authStore";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Lock,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Truck,
  Wallet,
  X,
} from "lucide-react";

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

/**
 * Universal safe UUID generator for idempotency.
 * Compatible with mobile browsers, insecure contexts, and webviews.
 */
function getSafeUUID() {
  try {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getEstimatedDeliveryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  // ── 1. Direct Buy Now vs Persistent Cart Resolution ─────────────────────────
  const directBuyFromState = location.state?.directBuy;
  const fromCart = location.state?.fromCart;

  const [directBuyItem, setDirectBuyItem] = useState(() => {
    if (fromCart) {
      try {
        sessionStorage.removeItem("direct_buy_item");
      } catch {}
      return null;
    }
    if (directBuyFromState) {
      try {
        sessionStorage.setItem(
          "direct_buy_item",
          JSON.stringify(directBuyFromState)
        );
      } catch {}
      return directBuyFromState;
    }
    try {
      const saved = sessionStorage.getItem("direct_buy_item");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const isDirectBuy = Boolean(directBuyItem);

  // ── 2. Steps & Modal State ──────────────────────────────────────────────────
  // "confirm" = Step 2: Confirm details (Screenshot 1)
  // "payment" = Step 3: Payments (Screenshot 2)
  const [currentStep, setCurrentStep] = useState("confirm");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  // Default open accordion on Payments page: "cod" (Cash on Delivery) or "recommended"
  const [activePaymentAccordion, setActivePaymentAccordion] = useState("cod");
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(true);
  const [error, setError] = useState("");
  const [limitWarning, setLimitWarning] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [addressModalError, setAddressModalError] = useState("");
  const updatingRef = useRef(false);
  const orderSubmittingRef = useRef(false);
  const limitTimerRef = useRef(null);
  const idempotencyAttemptRef = useRef({ fingerprint: null, key: null });

  useEffect(() => {
    return () => {
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    };
  }, []);

  const showLimitWarning = (msg) => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    setLimitWarning(msg);
    limitTimerRef.current = setTimeout(() => setLimitWarning(""), 3000);
  };

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: getAddresses,
  });

  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: !isDirectBuy,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const directProductSlug = directBuyItem?.product?.slug;
  const directProductId = directBuyItem?.product_id || directBuyItem?.product?.uid;
  const directProductQuery = useQuery({
    queryKey: ["direct-buy-product", directProductId, directProductSlug],
    queryFn: () => getLiveProduct(directProductSlug),
    enabled: Boolean(isDirectBuy && directProductSlug),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failureCount, err) => {
      if (err?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const [selectedAddressId, setSelectedAddressId] = useState(null);

  const addressList = useMemo(() => addresses.data ?? [], [addresses.data]);
  const selectedAddress = useMemo(
    () =>
      addressList.find((a) => a.uid === selectedAddressId) ||
      addressList.find((a) => a.is_default) ||
      addressList[0] ||
      null,
    [addressList, selectedAddressId]
  );

  // Auto-select initial address
  useEffect(() => {
    if (!addressList.length) {
      setSelectedAddressId(null);
      if (addresses.isSuccess) {
        setShowAddressModal(true);
        setShowNewAddressForm(true);
      }
      return;
    }

    const selectedStillExists = addressList.some(
      (address) => address.uid === selectedAddressId
    );
    const nextAddress =
      addressList.find((address) => address.uid === selectedAddressId) ||
      addressList.find((address) => address.is_default) ||
      addressList[0];

    if (!selectedStillExists || !selectedAddressId) {
      setSelectedAddressId(nextAddress.uid);
    }
  }, [addresses.isSuccess, addressList, selectedAddressId]);

  // Form for adding new address
  const newAddressForm = useForm({
    defaultValues: {
      name: user?.name || "",
      phone: user?.phone || "",
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: "",
      is_default: false,
    },
  });

  const addressMutation = useMutation({
    mutationFn: addAddress,
    onSuccess: (data) => {
      queryClient.setQueryData(["addresses"], (current = []) => {
        const withoutDuplicate = current.filter(
          (address) => address.uid !== data.uid
        );
        return data.is_default
          ? [
              data,
              ...withoutDuplicate.map((address) => ({
                ...address,
                is_default: false,
              })),
            ]
          : [...withoutDuplicate, data];
      });
      newAddressForm.reset();
      setAddressModalError("");
      setLastAddressUid(data.uid);
      setSelectedAddressId(data.uid);
      setShowNewAddressForm(false);
      setShowAddressModal(false);
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (e) => {
      setAddressModalError(getErrorMessage(e));
    },
  });

  // Cart item quantity update with instant optimistic update
  const updateCartMutation = useMutation({
    mutationFn: ({ uid, quantity }) => updateCartItem(uid, quantity),
    onMutate: async ({ uid, quantity }) => {
      setUpdatingItemId(uid);
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previousCart = queryClient.getQueryData(["cart"]);

      queryClient.setQueryData(["cart"], (old) => {
        if (!old || !old.items) return old;
        const updatedItems = old.items.map((it) =>
          it.uid === uid
            ? {
                ...it,
                quantity,
                line_total: Number(it.unit_price) * quantity,
              }
            : it
        );
        const newSubtotal = updatedItems.reduce(
          (sum, it) => sum + Number(it.unit_price) * it.quantity,
          0
        );
        return {
          ...old,
          items: updatedItems,
          subtotal: newSubtotal,
        };
      });

      return { previousCart };
    },
    onError: (err, _vars, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["cart"], context.previousCart);
      }
      setError(getErrorMessage(err));
    },
    onSettled: () => {
      updatingRef.current = false;
      setUpdatingItemId(null);
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  const removeCartMutation = useMutation({
    mutationFn: removeCartItem,
    onMutate: (uid) => {
      setUpdatingItemId(uid);
    },
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
    onSettled: () => {
      updatingRef.current = false;
      setUpdatingItemId(null);
    },
  });

  // Order checkout mutation
  const orderMutation = useMutation({
    mutationFn: checkout,
    onSuccess: (data) => {
      idempotencyAttemptRef.current = { fingerprint: null, key: null };
      try {
        sessionStorage.removeItem("direct_buy_item");
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
      navigate(`/orders/${data.uid}/success`, { state: { order: data } });
    },
    onError: (e) => {
      const status = e?.response?.status;
      // Rotate idempotency key on deterministic 4xx business rejection (e.g. stock changed)
      // so the user can fix quantities and submit cleanly; preserve key on 5xx/network retries.
      if (status && status >= 400 && status < 500) {
        idempotencyAttemptRef.current = { fingerprint: null, key: null };
      }
      setError(getErrorMessage(e));
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      if (isDirectBuy) {
        queryClient.invalidateQueries({ queryKey: ["direct-buy-product"] });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onSettled: () => {
      orderSubmittingRef.current = false;
    },
  });

  // ── 3. Quantity Controllers (Mobile & Desktop) ──────────────────────────────
  const liveDirectProduct = directProductQuery.data;
  const directUnavailable =
    isDirectBuy &&
    ((directProductQuery.isError && directProductQuery.error?.response?.status === 404) ||
      (directProductQuery.isSuccess && !liveDirectProduct));

  const updateDirectQuantity = (newQty, liveMaxLimit) => {
    if (!directBuyItem) return;
    const p = liveDirectProduct || directBuyItem.product || {};
    const stockLimit =
      typeof liveMaxLimit === "number"
        ? liveMaxLimit
        : p.available_stock !== undefined
        ? p.available_stock
        : p.stock !== undefined
        ? p.stock
        : 0;
    if (stockLimit <= 0) return;
    const clamped = Math.max(1, Math.min(stockLimit, newQty));
    const updated = {
      ...directBuyItem,
      product: liveDirectProduct || directBuyItem.product,
      quantity: clamped,
    };
    setDirectBuyItem(updated);
    try {
      sessionStorage.setItem("direct_buy_item", JSON.stringify(updated));
    } catch {}
  };

  const handleQuantityChange = (item, newQty) => {
    if (!isDirectBuy && (updatingRef.current || updatingItemId)) return;
    setError("");
    setLimitWarning("");

    const maxLimit =
      item.max_qty ??
      item.product?.available_stock ??
      item.product?.stock ??
      0;

    if (maxLimit <= 0) {
      showLimitWarning("This product is currently out of stock");
      return;
    }

    const isDecreasing = newQty < item.quantity;
    let targetQty = newQty;

    if (isDecreasing && item.quantity > maxLimit) {
      // Snap directly to available stock/cap when reducing an over-limit item
      targetQty = Math.min(newQty, maxLimit);
    } else if (targetQty > maxLimit) {
      showLimitWarning(`Maximum ${maxLimit} available for this product`);
      return;
    }

    if (targetQty < 1) return;

    if (isDirectBuy) {
      updateDirectQuantity(targetQty, maxLimit);
    } else {
      updatingRef.current = true;
      updateCartMutation.mutate({ uid: item.uid, quantity: targetQty });
    }
  };

  const handleRemoveCartItem = (item) => {
    if (isDirectBuy || updatingRef.current || updatingItemId) return;
    updatingRef.current = true;
    removeCartMutation.mutate(item.uid);
  };

  // ── 4. Line Items & Calculations ────────────────────────────────────────────
  const checkoutItems = useMemo(() => {
    if (isDirectBuy && directBuyItem) {
      if (directUnavailable) {
        const fallback = directBuyItem.product || {};
        return [
          {
            uid: directBuyItem.product_id || fallback.uid,
            product_id: directBuyItem.product_id || fallback.uid,
            title: fallback.title || "Selected Item",
            price: Number(fallback.price) || 0,
            mrp: Number(fallback.mrp) || Number(fallback.price) || 0,
            quantity: directBuyItem.quantity || 1,
            images: fallback.images || [],
            vendor: fallback.vendor,
            rating_avg: Number(fallback.rating_avg) || 0,
            rating_count: Number(fallback.rating_count) || 0,
            attributes: fallback.attributes,
            product: null,
            max_qty: 0,
            isOutOfStock: true,
          },
        ];
      }
      const p = liveDirectProduct || directBuyItem.product || {};
      const maxLimit =
        p.available_stock !== undefined
          ? p.available_stock
          : p.stock !== undefined
          ? p.stock
          : 0;
      return [
        {
          uid: directBuyItem.product_id || p.uid,
          product_id: directBuyItem.product_id || p.uid,
          title: p.title || "Selected Item",
          price: Number(p.price) || 0,
          mrp: Number(p.mrp) || Number(p.price) || 0,
          quantity: directBuyItem.quantity || 1,
          images: p.images || [],
          vendor: p.vendor,
          rating_avg: Number(p.rating_avg) || 0,
          rating_count: Number(p.rating_count) || 0,
          attributes: p.attributes,
          product: p,
          max_qty: maxLimit,
          isOutOfStock: p.is_available === false || maxLimit <= 0,
        },
      ];
    }
    return (cart.data?.items || []).map((item) => {
      const maxLimit =
        item.max_qty ??
        item.product?.available_stock ??
        item.product?.stock ??
        0;
      return {
        uid: item.uid,
        product_id: item.product_id,
        title: item.product_title || item.product?.title || "Item",
        price: Number(item.unit_price) || 0,
        mrp: Number(item.product?.mrp) || Number(item.unit_price) || 0,
        quantity: item.quantity || 1,
        images: item.product?.images || [],
        vendor: item.product?.vendor,
        rating_avg: Number(item.product?.rating_avg) || 0,
        rating_count: Number(item.product?.rating_count) || 0,
        attributes: item.product?.attributes,
        product: item.product,
        max_qty: maxLimit,
        isOutOfStock:
          item.isOutOfStock ||
          item.product?.is_available === false ||
          maxLimit <= 0,
      };
    });
  }, [isDirectBuy, directBuyItem, liveDirectProduct, directUnavailable, cart.data?.items]);

  const hasStockIssue = useMemo(() => {
    return checkoutItems.some(
      (item) =>
        item.isOutOfStock ||
        (typeof item.max_qty === "number" && item.quantity > item.max_qty)
    );
  }, [checkoutItems]);

  const sellingPrice = checkoutItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const mrpTotal = checkoutItems.reduce(
    (sum, item) => sum + (item.mrp || item.price) * item.quantity,
    0
  );
  const discountOnSellingPrice = Math.max(0, mrpTotal - sellingPrice);
  const totalAmount = sellingPrice;
  const estimatedDelivery = getEstimatedDeliveryDate();

  // Navigation handlers
  const handleProceedToPayment = () => {
    if (checkoutItems.length === 0) {
      setError("Your checkout session is empty.");
      return;
    }
    if (hasStockIssue) {
      setError("Please adjust quantities for out-of-stock items before proceeding.");
      return;
    }
    if (!selectedAddress && !selectedAddressId) {
      setShowAddressModal(true);
      return;
    }
    setError("");
    setCurrentStep("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToConfirm = () => {
    setError("");
    setCurrentStep("confirm");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Place order for a specific payment method (cod / online_mock)
  const handlePlaceOrderWithMethod = (method) => {
    if (orderSubmittingRef.current || orderMutation.isPending) return;
    if (hasStockIssue) {
      setError("Cannot place order: one or more items exceed available stock.");
      return;
    }
    const addressUid = selectedAddress?.uid || selectedAddressId;

    if (!addressUid) {
      setShowAddressModal(true);
      return;
    }

    if (checkoutItems.length === 0) {
      setError("Your checkout session is empty.");
      return;
    }

    setError("");

    const payload = {
      address_id: addressUid,
      payment_method: method, // "cod" | "online_mock"
      ...(isDirectBuy && directBuyItem
        ? {
            direct_item: {
              product_id:
                directBuyItem.product_id || directBuyItem.product?.uid,
              quantity: directBuyItem.quantity,
            },
          }
        : {}),
    };

    const fingerprint = JSON.stringify({
      payload,
      items: checkoutItems.map((i) => [i.product_id, i.quantity]),
    });
    if (
      idempotencyAttemptRef.current.fingerprint !== fingerprint ||
      !idempotencyAttemptRef.current.key
    ) {
      idempotencyAttemptRef.current = {
        fingerprint,
        key: getSafeUUID(),
      };
    }

    orderSubmittingRef.current = true;
    orderMutation.mutate({
      payload,
      idempotencyKey: idempotencyAttemptRef.current.key,
    });
  };

  // ── Early returns for unauthorized, loading, error, and empty state ─────────
  if (!accessToken) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          title="Sign in to checkout"
          description="Please sign in to complete your order."
          action={
            <Button
              className="btn-3d-primary text-white"
              onClick={() => navigate("/account?next=/checkout")}
            >
              Sign in
            </Button>
          }
        />
      </div>
    );
  }

  const isLoadingCheckout =
    addresses.isLoading ||
    (!isDirectBuy && cart.isLoading) ||
    (isDirectBuy && Boolean(directProductSlug) && directProductQuery.isLoading);

  if (isLoadingCheckout) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  const isFatalError =
    addresses.isError ||
    (!isDirectBuy && cart.isError) ||
    (isDirectBuy &&
      directProductQuery.isError &&
      directProductQuery.error?.response?.status !== 404);

  if (isFatalError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState
          onRetry={() => {
            if (addresses.isError) addresses.refetch();
            if (!isDirectBuy && cart.isError) cart.refetch();
            if (isDirectBuy && directProductQuery.isError) directProductQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (!isDirectBuy && cart.isSuccess && checkoutItems.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          title="Your checkout is empty"
          description="Browse products and add them to your cart to checkout."
          action={
            <Link to="/products">
              <Button className="btn-3d-primary text-white">
                Explore Products
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] pb-32 sm:pb-20 text-slate-900 font-sans">
      {/* ══════════════════════════════════════════════════════════════════════════
          FLIPKART-STYLE TOP HEADER (Matches Screenshot 1 & 2)
          ══════════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white shadow-2xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (currentStep === "payment") {
                  handleBackToConfirm();
                } else {
                  navigate(isDirectBuy ? -1 : "/cart");
                }
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft size={20} strokeWidth={2.2} />
            </button>

            <div>
              {currentStep === "payment" && (
                <p className="text-[11px] font-semibold text-slate-500 leading-none mb-0.5">
                  Step 3 of 3
                </p>
              )}
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {currentStep === "confirm" ? "Confirm details" : "Payments"}
              </h1>
            </div>
          </div>

          {/* Top Right: 100% Secure Badge */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100/90 px-2.5 py-1 rounded-full border border-slate-200">
            <Lock size={12} className="text-slate-600" />
            <span className="text-[11px] sm:text-xs">100% Secure</span>
          </div>
        </div>

        {/* Stepper Progress Bar on Confirm Details page (Matches Screenshot 1) */}
        {currentStep === "confirm" && (
          <div className="border-t border-slate-100 bg-white py-2 px-6">
            <div className="mx-auto flex max-w-xs items-center justify-between text-xs">
              {/* Step 1: Address (Completed) */}
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="flex flex-col items-center gap-1 cursor-pointer group"
              >
                <div className="grid h-6 w-6 place-items-center rounded-full border-2 border-brand-600 bg-white text-brand-600">
                  <Check size={13} strokeWidth={3} />
                </div>
                <span className="text-[11px] font-semibold text-slate-600">
                  Address
                </span>
              </button>

              {/* Connector line 1 */}
              <div className="h-0.5 flex-1 mx-2 bg-brand-600" />

              {/* Step 2: Confirm details (Active) */}
              <div className="flex flex-col items-center gap-1">
                <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white font-bold text-xs shadow-xs">
                  2
                </div>
                <span className="text-[11px] font-extrabold text-slate-900">
                  Confirm details
                </span>
              </div>

              {/* Connector line 2 */}
              <div className="h-0.5 flex-1 mx-2 bg-slate-200" />

              {/* Step 3: Payment (Upcoming) */}
              <div className="flex flex-col items-center gap-1 opacity-50">
                <div className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-slate-500 font-bold text-xs">
                  3
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Payment
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════════════════════
          MAIN CONTENT CONTAINER
          ══════════════════════════════════════════════════════════════════════════ */}
      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 space-y-4">
        {/* Error notification */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-red-500 hover:text-red-700"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Quantity limit notice */}
        {limitWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 flex items-center gap-2 shadow-2xs animate-in fade-in">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>{limitWarning}</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            STEP 2: CONFIRM DETAILS VIEW (MATCHES SCREENSHOT 1 EXACTLY)
            ══════════════════════════════════════════════════════════════════════════ */}
        {currentStep === "confirm" && (
          <div className="space-y-3.5">
            {/* Section Title */}
            <h2 className="text-base font-bold text-slate-900">Delivering to</h2>

            {/* Delivering to Card (Matches Screenshot 1) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <MapPin
                    size={18}
                    className="text-slate-900 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {selectedAddress ? selectedAddress.name : user?.name || "Customer"}
                    </span>
                    {selectedAddress ? (
                      <div className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed select-none pointer-events-none">
                        <p>
                          {selectedAddress.line1}
                          {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""},{" "}
                          {selectedAddress.city}, {selectedAddress.state} &mdash;{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedAddress.pincode}
                          </span>
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <Phone size={13} /> {selectedAddress.phone}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-red-600 font-medium">
                        No delivery address selected.
                      </p>
                    )}
                  </div>
                </div>

                {/* Change button that pops up address list */}
                <button
                  type="button"
                  onClick={() => setShowAddressModal(true)}
                  className="text-xs sm:text-sm font-bold text-brand-600 hover:text-brand-700 hover:underline shrink-0 pt-0.5 cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Order Items Card with Stepper and Pricing (Matches Screenshot 1) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs divide-y divide-slate-100">
              {checkoutItems.map((item) => {
                const discountPct =
                  item.mrp && item.mrp > item.price
                    ? Math.round(((item.mrp - item.price) / item.mrp) * 100)
                    : 0;

                const maxLimit =
                  item.max_qty ??
                  item.product?.available_stock ??
                  item.product?.stock ??
                  0;

                const isAtLimit = item.quantity >= maxLimit;
                const isUpdating = updatingItemId === item.uid;

                return (
                  <div
                    key={item.uid}
                    className="py-3.5 first:pt-0 last:pb-0 space-y-3"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      {/* Product Thumbnail & Quantity Stepper underneath (Matches Screenshot 1) */}
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className="h-20 w-20 sm:h-22 sm:w-22 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <img
                            src={productImage(item)}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        {/* Quantity Stepper: [- 1 +] with touch-friendly 36px buttons */}
                        <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs">
                          <button
                            type="button"
                            disabled={item.quantity <= 1 || isUpdating}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuantityChange(item, item.quantity - 1);
                            }}
                            className="grid h-7 w-7 sm:h-6 sm:w-6 place-items-center text-slate-700 hover:bg-slate-100 rounded-l-lg disabled:opacity-30 cursor-pointer active:scale-95 transition touch-manipulation select-none"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} strokeWidth={2.5} />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-slate-900 tabular-nums select-none">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isAtLimit || isUpdating || item.isOutOfStock || maxLimit <= 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuantityChange(item, item.quantity + 1);
                            }}
                            className="grid h-7 w-7 sm:h-6 sm:w-6 place-items-center text-slate-700 hover:bg-slate-100 rounded-r-lg disabled:opacity-30 cursor-pointer active:scale-95 transition touch-manipulation select-none"
                            aria-label="Increase quantity"
                            title={isAtLimit ? "Max stock reached" : "Increase quantity"}
                          >
                            <Plus size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>

                      {/* Product Details (Matches Screenshot 1) */}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
                          {item.title}
                        </h3>
                        {item.attributes?.size && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Size: {item.attributes.size}
                          </p>
                        )}

                        {/* Rating pill */}
                        {Number(item.rating_avg) > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-xs">
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-700 px-1.5 py-0.2 text-[11px] font-bold text-white">
                              {Number(item.rating_avg).toFixed(1)} ★
                            </span>
                            {Number(item.rating_count) > 0 && (
                              <span className="text-slate-400">
                                {item.rating_count}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stock warnings */}
                        {item.isOutOfStock && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="flex items-center gap-1 text-xs font-bold text-red-600" role="alert">
                              <AlertCircle size={13} /> Out of stock
                            </p>
                            {!isDirectBuy && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleRemoveCartItem(item)}
                                className="text-xs font-bold text-brand-700 underline hover:text-brand-800 disabled:opacity-40 cursor-pointer"
                              >
                                Remove item
                              </button>
                            )}
                          </div>
                        )}
                        {!item.isOutOfStock && item.quantity > item.max_qty && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700" role="alert">
                            <AlertCircle size={13} /> Only {item.max_qty} available in stock
                          </p>
                        )}

                        {/* Price Details */}
                        <div className="mt-1.5 flex items-baseline gap-2">
                          {discountPct > 0 && (
                            <span className="text-xs font-bold text-emerald-700 flex items-center">
                              ↓{discountPct}%
                            </span>
                          )}
                          {item.mrp && item.mrp > item.price && (
                            <span className="text-xs text-slate-400 line-through tabular-nums">
                              {formatCurrency(item.mrp * item.quantity).replace("₹", "")}
                            </span>
                          )}
                          <span className="text-sm sm:text-base font-extrabold text-slate-900 tabular-nums">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Date Pill (Matches Screenshot 1) */}
                    <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Truck size={14} className="text-slate-600 shrink-0" />
                      <span>Delivery by {estimatedDelivery}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* WOW! Savings Zone Card (Matches Screenshot 1) */}
            <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black italic tracking-wide text-sky-900">
                  WOW!
                </span>
                <span className="text-xs font-bold text-slate-800">
                  Savings zone
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white border border-sky-100 p-3 shadow-2xs cursor-pointer hover:bg-sky-50/20 transition">
                <span className="text-xs font-bold text-slate-800">
                  View all coupons and offers
                </span>
                <ChevronRight size={15} className="text-slate-400" />
              </div>
            </div>

            {/* Desktop Continue CTA */}
            <div className="hidden sm:flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div>
                <p className="text-xs text-slate-500">Total Amount</p>
                <p className="text-xl font-black text-slate-900 tabular-nums">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <button
                type="button"
                disabled={hasStockIssue || checkoutItems.length === 0}
                onClick={handleProceedToPayment}
                className="rounded-full bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold px-8 py-3 text-sm shadow-sm transition active:scale-95 cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            STEP 3: PAYMENTS VIEW (MATCHES SCREENSHOT 2 & 3 WITH COD ENABLED)
            ══════════════════════════════════════════════════════════════════════════ */}
        {currentStep === "payment" && (
          <div className="space-y-3.5">
            {hasStockIssue && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs font-semibold text-red-800" role="alert">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-red-600" />
                  <span>
                    Stock changed for one or more items. Please review your order quantities before paying.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBackToConfirm}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 cursor-pointer"
                >
                  Review items
                </button>
              </div>
            )}

            {/* 1. Total Amount Summary Box (Matches Screenshot 2) */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowPriceBreakdown((v) => !v)}
                  className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <span>Total Amount</span>
                  {showPriceBreakdown ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
                <span className="text-base sm:text-lg font-black text-blue-700 tabular-nums">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              {showPriceBreakdown && (
                <div className="space-y-1.5 pt-1 border-t border-blue-100/70 text-xs">
                  {discountOnSellingPrice > 0 && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="underline decoration-dotted">
                        Bank / store cashback
                      </span>
                      <span className="font-bold text-emerald-700">
                        -{formatCurrency(discountOnSellingPrice)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-700 font-semibold pt-0.5">
                    <span>Final Amount</span>
                    <span className="tabular-nums font-bold text-slate-900">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. 5% Cashback Offer Banner (Matches Screenshot 2) */}
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-xs sm:text-sm font-black text-emerald-800">
                  5% Cashback
                </p>
                <p className="text-[11px] text-emerald-700">
                  Claim now with payment offers
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[10px] font-extrabold text-white">
                  UPI
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-purple-600 text-[10px] font-extrabold text-white">
                  M
                </span>
                <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                  +3
                </span>
              </div>
            </div>

            {/* 3. Payment Accordions (With COD Prominently Placeable and Working!) */}
            <div className="space-y-3">
              {/* Option 1: Cash on Delivery (COD) — FULLY FUNCTIONAL PLACE ORDER */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setActivePaymentAccordion((v) => (v === "cod" ? "" : "cod"))
                  }
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Wallet size={17} className="text-slate-800" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Cash on Delivery (COD)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Pay with cash or UPI QR at your doorstep
                      </p>
                    </div>
                  </div>
                  {activePaymentAccordion === "cod" ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>

                {activePaymentAccordion === "cod" && (
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      You can pay via Cash or any UPI QR code directly to the
                      delivery partner when your order is delivered.
                    </p>

                    {/* Single Direct COD Place Order Button (Matches Screenshot 2 yellow button style) */}
                    <button
                      type="button"
                      disabled={orderMutation.isPending || hasStockIssue}
                      onClick={() => handlePlaceOrderWithMethod("cod")}
                      className="w-full rounded-xl bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 text-sm sm:text-base shadow-sm transition active:scale-98 cursor-pointer"
                    >
                      {orderMutation.isPending
                        ? "Placing Order..."
                        : `Place Order • ${formatCurrency(totalAmount)}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Option 2: Recommended for You (Matches Screenshot 2) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setActivePaymentAccordion((v) =>
                      v === "recommended" ? "" : "recommended"
                    )
                  }
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ThumbsUp size={16} className="text-slate-800" />
                    <span className="text-sm font-bold text-slate-900">
                      Recommended for You
                    </span>
                  </div>
                  {activePaymentAccordion === "recommended" ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>

                {activePaymentAccordion === "recommended" && (
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">BHIM UPI</p>
                        <p className="text-xs text-emerald-700 flex items-center gap-1 mt-0.5 font-medium">
                          <Check size={12} strokeWidth={3} />
                          Instant digital payment enabled
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        Fast
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={orderMutation.isPending || hasStockIssue}
                      onClick={() => handlePlaceOrderWithMethod("online_mock")}
                      className="w-full rounded-xl bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 text-sm sm:text-base shadow-sm transition active:scale-98 cursor-pointer"
                    >
                      {orderMutation.isPending
                        ? "Processing..."
                        : `Pay ${formatCurrency(totalAmount)}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Option 3: UPI (Matches Screenshot 2) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setActivePaymentAccordion((v) => (v === "upi" ? "" : "upi"))
                  }
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-5 w-7 place-items-center rounded border border-slate-300 text-[10px] font-bold text-slate-700">
                      UPI
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">UPI</p>
                      <p className="text-[11px] text-slate-500">
                        Pay by any UPI app
                      </p>
                    </div>
                  </div>
                  {activePaymentAccordion === "upi" ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>

                {activePaymentAccordion === "upi" && (
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-xs text-slate-600">
                      Pay instantly with any UPI app (Google Pay, PhonePe, Paytm).
                    </p>
                    <button
                      type="button"
                      disabled={orderMutation.isPending || hasStockIssue}
                      onClick={() => handlePlaceOrderWithMethod("online_mock")}
                      className="w-full rounded-xl bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 text-sm sm:text-base shadow-sm transition active:scale-98 cursor-pointer"
                    >
                      {orderMutation.isPending
                        ? "Processing..."
                        : `Pay ${formatCurrency(totalAmount)} via UPI`}
                    </button>
                  </div>
                )}
              </div>

              {/* Option 4: Credit / Debit / ATM Card (Matches Screenshot 2) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setActivePaymentAccordion((v) => (v === "card" ? "" : "card"))
                  }
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard size={17} className="text-slate-800" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Credit / Debit / ATM Card
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Add and secure cards as per RBI guidelines
                      </p>
                    </div>
                  </div>
                  {activePaymentAccordion === "card" ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>

                {activePaymentAccordion === "card" && (
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-xs text-slate-600">
                      Visa, MasterCard, RuPay cards supported with 256-bit
                      encryption.
                    </p>
                    <button
                      type="button"
                      disabled={orderMutation.isPending || hasStockIssue}
                      onClick={() => handlePlaceOrderWithMethod("online_mock")}
                      className="w-full rounded-xl bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 text-sm sm:text-base shadow-sm transition active:scale-98 cursor-pointer"
                    >
                      {orderMutation.isPending
                        ? "Processing..."
                        : `Pay ${formatCurrency(totalAmount)} via Card`}
                    </button>
                  </div>
                )}
              </div>

              {/* Option 5: Pay Later (Matches Screenshot 2) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <div className="flex items-center justify-between text-left opacity-60">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      ₹
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Pay Later
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Available on eligible credit profiles
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={16} className="text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════════════
          FLIPKART ADDRESS SELECTION POP-UP MODAL (ON "CHANGE" BUTTON CLICK)
          ══════════════════════════════════════════════════════════════════════════ */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full sm:max-w-xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Select Delivery Address
                </h3>
                <p className="text-xs text-slate-500">
                  Choose a saved address or add a new one
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (addressList.length > 0) {
                    setAddressModalError("");
                    setShowAddressModal(false);
                    setShowNewAddressForm(false);
                  }
                }}
                disabled={addressList.length === 0}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {addressModalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 flex items-center justify-between gap-2" role="alert">
                  <span className="flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-red-600" />
                    {addressModalError}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddressModalError("")}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* "+ Add a New Address" toggle */}
              {!showNewAddressForm && (
                <button
                  type="button"
                  onClick={() => setShowNewAddressForm(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 py-3 text-xs sm:text-sm font-bold text-brand-700 hover:bg-brand-100/60 transition cursor-pointer"
                >
                  <Plus size={16} />
                  <span>+ Add a New Address</span>
                </button>
              )}

              {/* Add New Address Form */}
              {showNewAddressForm && (
                <form
                  onSubmit={newAddressForm.handleSubmit((data) =>
                    addressMutation.mutate(data)
                  )}
                  className="rounded-xl border border-brand-200 bg-slate-50/70 p-4 grid gap-3 sm:grid-cols-2"
                >
                  <div className="sm:col-span-2 flex items-center justify-between border-b border-slate-200 pb-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-800">
                      Add New Delivery Address
                    </span>
                    {addressList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowNewAddressForm(false)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <Input
                    label="Full Name"
                    error={newAddressForm.formState.errors.name?.message}
                    {...newAddressForm.register("name", {
                      required: "Name is required",
                    })}
                  />
                  <Input
                    label="10-digit Mobile Number"
                    error={newAddressForm.formState.errors.phone?.message}
                    inputMode="numeric"
                    {...newAddressForm.register("phone", {
                      required: "Phone is required",
                      pattern: {
                        value: PHONE_REGEX,
                        message: "Enter a valid 10-digit mobile number",
                      },
                    })}
                  />
                  <Input
                    label="Address (House No., Building, Street, Area)"
                    error={newAddressForm.formState.errors.line1?.message}
                    className="sm:col-span-2"
                    {...newAddressForm.register("line1", {
                      required: "Address line 1 is required",
                    })}
                  />
                  <Input
                    label="Locality / Landmark (Optional)"
                    {...newAddressForm.register("line2")}
                  />
                  <Input
                    label="City"
                    error={newAddressForm.formState.errors.city?.message}
                    {...newAddressForm.register("city", {
                      required: "City is required",
                    })}
                  />
                  <Input
                    label="State"
                    error={newAddressForm.formState.errors.state?.message}
                    {...newAddressForm.register("state", {
                      required: "State is required",
                    })}
                  />
                  <Input
                    label="6-digit Pincode"
                    error={newAddressForm.formState.errors.pincode?.message}
                    inputMode="numeric"
                    {...newAddressForm.register("pincode", {
                      required: "Pincode is required",
                      pattern: {
                        value: PINCODE_REGEX,
                        message: "Enter a valid 6-digit Indian postal code",
                      },
                    })}
                  />
                  <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none py-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-brand-600 cursor-pointer"
                      {...newAddressForm.register("is_default")}
                    />
                    Make this my default address
                  </label>

                  <Button
                    loading={addressMutation.isPending}
                    className="sm:col-span-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5"
                  >
                    Save & Deliver Here
                  </Button>
                </form>
              )}

              {/* Saved Addresses List */}
              <div className="space-y-3">
                {addressList.map((addr) => {
                  const isSelected = selectedAddressId === addr.uid;
                  return (
                    <div
                      key={addr.uid}
                      onClick={() => setSelectedAddressId(addr.uid)}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all duration-150 ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/20 ring-2 ring-brand-300 shadow-xs"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="modal_address_radio"
                        value={addr.uid}
                        checked={isSelected}
                        onChange={() => setSelectedAddressId(addr.uid)}
                        className="mt-1 h-4 w-4 accent-brand-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1 text-xs sm:text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {addr.name}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {addr.phone}
                          </span>
                          {addr.is_default && (
                            <span className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 border border-brand-200">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-slate-600 leading-relaxed">
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ""}
                        </p>
                        <p className="text-slate-600 font-medium">
                          {addr.city}, {addr.state} &mdash;{" "}
                          <span className="font-bold text-slate-900">
                            {addr.pincode}
                          </span>
                        </p>

                        {isSelected && (
                          <div className="mt-3 flex items-center justify-between border-t border-brand-100 pt-3">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                              <Check size={14} className="text-brand-600" /> Selected
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAddressId(addr.uid);
                                setLastAddressUid(addr.uid);
                                setShowAddressModal(false);
                                setShowNewAddressForm(false);
                              }}
                              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-extrabold px-4 py-1.5 text-xs uppercase tracking-wider shadow-xs transition active:scale-95 cursor-pointer"
                            >
                              Deliver Here
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          FLIPKART MOBILE STICKY BOTTOM BAR (ON CONFIRM DETAILS STEP ONLY)
          (MATCHES SCREENSHOT 1 EXACTLY)
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === "confirm" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
          {/* Green Savings Pill Header */}
          {discountOnSellingPrice > 0 && (
            <div className="bg-emerald-50 px-4 py-1 text-center text-xs font-semibold text-emerald-800 border-b border-emerald-100/70">
              You&apos;ll save {formatCurrency(discountOnSellingPrice)} on this order
            </div>
          )}

          {/* Pricing & Yellow Continue Button (Matches Screenshot 1) */}
          <div className="flex items-center justify-between px-4 pt-2.5">
            <div>
              {mrpTotal > sellingPrice && (
                <p className="text-xs text-slate-400 line-through tabular-nums leading-none mb-1">
                  {formatCurrency(mrpTotal).replace("₹", "")}
                </p>
              )}
              <p className="text-lg font-black text-slate-900 tabular-nums leading-none">
                {formatCurrency(totalAmount)}
              </p>
            </div>

            <button
              type="button"
              disabled={hasStockIssue || checkoutItems.length === 0}
              onClick={handleProceedToPayment}
              className="rounded-full bg-[#ffd814] hover:bg-[#f7cf00] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold px-8 py-2.5 text-sm shadow-sm active:scale-95 transition cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
