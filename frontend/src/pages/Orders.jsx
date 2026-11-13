import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import { cancelOrder, getOrder, getOrders } from "../api/shop";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui";
import { formatCurrency, formatDate, orderItemImage } from "../lib/formatters";
import { broadcastOrderUpdate, subscribeToOrderUpdates } from "../lib/orderSync";
// ─── Status helpers ───────────────────────────────────────────────────────────

function getStatusTone(status) {
  switch (status?.toLowerCase()) {
    case "delivered":
      return "success";
    case "cancelled":
      return "danger";
    case "shipped":
    case "confirmed":
      return "warning";
    default:
      return "neutral";
  }
}

function getStatusLabel(status) {
  switch (status?.toLowerCase()) {
    case "placed":
      return "Order Placed";
    case "confirmed":
      return "Confirmed";
    case "shipped":
      return "Shipped";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "partially_delivered":
      return "Partially Delivered";
    default:
      return status || "Processing";
  }
}

/**
 * Derive a customer-facing master status from the sub-order statuses.
 * This is the single source of truth for the UI — never blindly use order.status
 * because one vendor completing delivery must NOT imply the whole order is done.
 */
function deriveMasterStatus(subOrders) {
  if (!subOrders?.length) return "placed";

  const active = subOrders.filter((s) => s.status !== "cancelled");

  if (!active.length) return "cancelled";

  const statuses = active.map((s) => s.status);
  const allDelivered = statuses.every((s) => s === "delivered");
  const anyDelivered = statuses.some((s) => s === "delivered");
  const anyShipped = statuses.some((s) => s === "shipped" || s === "delivered");
  const anyConfirmed = statuses.some((s) => s === "confirmed");

  if (allDelivered) return "delivered";
  if (anyDelivered) return "partially_delivered"; // key fix
  if (anyShipped) return "shipped";
  if (anyConfirmed) return "confirmed";
  return "placed";
}

function getMasterStatusTone(masterStatus) {
  switch (masterStatus) {
    case "delivered":
      return "success";
    case "partially_delivered":
      return "warning";
    case "cancelled":
      return "danger";
    case "shipped":
    case "confirmed":
      return "warning";
    default:
      return "neutral";
  }
}

// ─── Shipment tracking stepper (per sub-order) ────────────────────────────────

const TRACKING_STEPS = [
  { key: "placed", label: "Placed", icon: CheckCircle2 },
  { key: "confirmed", label: "Confirmed", icon: ShieldCheck },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
];

function ShipmentTracker({ sub, isOrderCancelled = false }) {
  const isCancelled = sub.status === "cancelled";
  const currentIdx = isCancelled
    ? -1
    : TRACKING_STEPS.findIndex((s) => s.key === sub.status);

  if (isCancelled) {
    if (isOrderCancelled) {
      return (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
          Shipment cancelled with order
        </div>
      );
    }
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
        <XCircle size={14} className="shrink-0 text-red-500" />
        <span className="font-medium">This shipment was cancelled.</span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Stepper */}
      <div className="relative flex items-center justify-between">
        {/* Connecting line behind icons */}
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-slate-200" aria-hidden="true">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{
              width:
                currentIdx <= 0
                  ? "0%"
                  : `${(currentIdx / (TRACKING_STEPS.length - 1)) * 100}%`,
            }}
          />
        </div>

        {TRACKING_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const passed = currentIdx >= idx;
          const current = currentIdx === idx;

          return (
            <div key={step.key} className="relative z-10 flex flex-col items-center">
              <div
                className={`grid h-10 w-10 place-items-center rounded-full border-2 transition-all ${
                  passed
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-400"
                } ${current ? "ring-4 ring-emerald-100" : ""}`}
              >
                <Icon size={16} />
              </div>
              <span
                className={`mt-2 max-w-[60px] text-center text-[10px] font-semibold leading-tight sm:text-xs ${
                  passed ? "text-ink" : "text-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Timestamp under stepper */}
      {sub.updated_at && sub.status !== "placed" && (
        <p className="mt-3 text-center text-[11px] text-muted">
          Last updated: {formatDate(sub.updated_at)}
        </p>
      )}
    </div>
  );
}

// ─── CUSTOMER ORDERS LIST PAGE (/orders) ─────────────────────────────────────

export function Orders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToOrderUpdates(() => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    });
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const list = q.state.data;
      if (!Array.isArray(list) || list.length === 0) return false;
      const hasActive = list.some((o) => {
        const ms = deriveMasterStatus(o.sub_orders);
        return ["placed", "confirmed", "shipped", "partially_delivered"].includes(ms);
      });
      return hasActive ? 6000 : false;
    },
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-12 w-full max-w-md" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ErrorState onRetry={query.refetch} />
      </div>
    );
  }

  const rawOrders = Array.isArray(query.data) ? query.data : [];

  // Augment each order with the client-computed master status
  const orders = rawOrders.map((o) => ({
    ...o,
    _masterStatus: deriveMasterStatus(o.sub_orders),
  }));

  const filteredOrders = orders.filter((order) => {
    const ms = order._masterStatus;
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "in_progress"
          ? ["placed", "confirmed", "shipped", "partially_delivered"].includes(ms)
          : ms === statusFilter;

    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    const orderIdMatch = order.uid?.toLowerCase().includes(q);
    const itemMatch = order.sub_orders?.some((sub) =>
      sub.items?.some((item) =>
        item.title_snapshot?.toLowerCase().includes(q),
      ),
    );
    return orderIdMatch || itemMatch;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            My Orders
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track, view invoices, and manage your purchases — each shipment tracked individually
          </p>
        </div>
        <Link to="/products">
          <Button variant="outline" className="gap-2">
            <ShoppingBag size={16} /> Continue Shopping
          </Button>
        </Link>
      </div>

      {rawOrders.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="You haven't placed any orders yet"
            description="Explore our catalog and find something you love."
            action={
              <Link to="/products">
                <Button className="mt-2 gap-2">
                  <ShoppingBag size={18} /> Start Shopping Now
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* Search & Filter */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search by Order ID or Product name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 text-sm">
              {[
                { id: "all", label: `All (${orders.length})` },
                { id: "in_progress", label: "In Progress" },
                { id: "partially_delivered", label: "Partial" },
                { id: "delivered", label: "Delivered" },
                { id: "cancelled", label: "Cancelled" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-3.5 py-2 font-medium transition ${
                    statusFilter === tab.id
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white text-muted border border-line hover:bg-slate-50 hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="mt-10 rounded-card border border-dashed border-line bg-white p-12 text-center">
              <Package size={40} className="mx-auto text-slate-300" />
              <h3 className="mt-4 font-semibold text-ink">No orders match your filter</h3>
              <p className="mt-1 text-sm text-muted">Try a different search or reset the filter.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {filteredOrders.map((order) => {
                const totalItems =
                  order.sub_orders?.reduce(
                    (acc, sub) =>
                      acc + (sub.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0),
                    0,
                  ) || 0;
                const storeCount = order.sub_orders?.length || 1;
                const ms = order._masterStatus;

                return (
                  <div
                    key={order.uid}
                    className="overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:border-brand-200 hover:shadow-float"
                  >
                    {/* Order header row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {/* Master status derived from sub-orders — never lies */}
                        <Badge tone={getMasterStatusTone(ms)}>
                          {getStatusLabel(ms)}
                        </Badge>
                        <span className="text-sm text-muted">
                          Placed {formatDate(order.created_at)}
                        </span>
                        <span className="hidden text-slate-300 sm:inline">•</span>
                        <span className="text-sm text-muted">
                          {totalItems} item{totalItems !== 1 ? "s" : ""}
                          {storeCount > 1 ? ` from ${storeCount} sellers` : ""}
                        </span>
                      </div>
                      <p className="max-w-full break-words text-right text-base font-bold text-ink tabular-nums [overflow-wrap:anywhere]">
                        {formatCurrency(order.total)}
                      </p>
                    </div>

                    {/* Per-shipment summary (only shown when not fully cancelled to avoid duplicate noise) */}
                    {storeCount > 1 && order._masterStatus !== "cancelled" && (
                      <div className="border-b border-line bg-slate-50/60 px-5 py-3 sm:px-6">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                          Shipments
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {order.sub_orders?.map((sub) => (
                            <span
                              key={sub.uid}
                              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm"
                            >
                              <Store size={11} className="text-brand-500" />
                              {sub.store_name || "Seller"}
                              <span className="ml-1">
                                <Badge tone={getStatusTone(sub.status)} className="text-[10px]">
                                  {getStatusLabel(sub.status)}
                                </Badge>
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Items preview */}
                    <div className="divide-y divide-line">
                      {order.sub_orders?.map((sub) => (
                        <div key={sub.uid} className="px-5 py-4 sm:px-6">
                          {/* Sub-order store label + status */}
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Store size={15} className="text-brand-600" />
                              <span className="font-bold text-ink">
                                {sub.store_name || "Marketplace Seller"}
                              </span>
                              <span className="text-muted">
                                · {sub.items?.length || 0} item
                                {sub.items?.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <Badge tone={getStatusTone(sub.status)}>
                              {getStatusLabel(sub.status)}
                            </Badge>
                          </div>

                          {/* Items */}
                          <div className="space-y-3">
                            {sub.items?.map((item) => (
                              <div key={item.uid} className="flex gap-4">
                                <Link
                                  to={
                                    item.product_slug
                                      ? `/p/${item.product_slug}`
                                      : `/orders/${order.uid}`
                                  }
                                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 transition hover:ring-brand-300 sm:h-24 sm:w-24"
                                >
                                  <img
                                    src={orderItemImage(item)}
                                    alt={item.title_snapshot}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(item.product_slug || item.uid || "item")}/400/400`;
                                    }}
                                  />
                                </Link>
                                <div className="min-w-0 flex-1 py-1">
                                  <Link
                                    to={
                                      item.product_slug
                                        ? `/p/${item.product_slug}`
                                        : `/orders/${order.uid}`
                                    }
                                    className="line-clamp-2 text-sm font-semibold leading-5 text-ink transition hover:text-brand-700"
                                  >
                                    {item.title_snapshot}
                                  </Link>
                                  <p className="mt-1.5 text-sm text-muted">Qty: {item.quantity}</p>
                                  <p className="mt-0.5 text-sm font-bold text-ink">
                                    {formatCurrency(
                                      item.line_total ||
                                        Number(item.price_snapshot) * item.quantity,
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end border-t border-line bg-slate-50/60 px-5 py-3.5 sm:px-6">
                      <Link
                        to={`/orders/${order.uid}`}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                      >
                        View full tracking
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ORDER DETAIL & TRACKING PAGE (/orders/:id  &  /orders/:id/success) ──────

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isSuccess =
    location.pathname.endsWith("/success") || Boolean(location.state?.order);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [shippedNotice, setShippedNotice] = useState(null);

  // Subscribe to real-time cross-tab order updates
  useEffect(() => {
    return subscribeToOrderUpdates((data) => {
      if (!data.orderId || data.orderId === id) {
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    });
  }, [id, queryClient]);

  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    placeholderData: () => {
      if (location.state?.order) return location.state.order;
      const cached = queryClient.getQueryData(["orders"]);
      return cached?.find((o) => o.uid === id);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const currentOrder = q.state.data;
      if (!currentOrder) return 3000;
      const ms = deriveMasterStatus(currentOrder.sub_orders);
      // Active/cancellable states: poll frequently (3s) to prevent state divergence
      if (["placed", "confirmed"].includes(ms)) return 3000;
      // In-transit states: poll moderately (8s)
      if (["shipped", "partially_delivered"].includes(ms)) return 8000;
      // Terminal states (delivered/cancelled): stop polling
      return false;
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: (data) => {
      setConfirmCancel(false);
      setCancelError(null);
      setShippedNotice(null);
      queryClient.setQueryData(["order", id], data);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
      broadcastOrderUpdate({ orderId: id, status: "cancelled" });
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Could not cancel your order. Please try again.";
      // A seller may ship between rendering the action and submitting it.
      // Close the stale confirmation, notify the user with a prominent banner,
      // and refresh authoritative server state immediately.
      if (
        msg.includes("can no longer be cancelled because a seller has shipped it") ||
        msg.toLowerCase().includes("shipped")
      ) {
        setConfirmCancel(false);
        setCancelError(null);
        setShippedNotice(
          "Notice: This order has already been marked as shipped by the seller and can no longer be cancelled. Tracking details have been updated."
        );
        queryClient.invalidateQueries({ queryKey: ["order", id] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        return;
      }
      setCancelError(msg);
    },
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-10 w-64" />
        <Skeleton className="mt-6 h-52 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <ErrorState
          onRetry={query.refetch}
          message="We could not find this order or you do not have permission to view it."
        />
        <div className="mt-4 text-center">
          <Link to="/orders">
            <Button variant="outline">Back to My Orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  const order = query.data;

  // ── Derive master status from sub-orders, not from order.status ──
  const masterStatus = deriveMasterStatus(order.sub_orders);

  const copyOrderId = () => {
    navigator.clipboard?.writeText(order.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeSubs = order.sub_orders?.filter((s) => s.status !== "cancelled") ?? [];
  const cancelledSubs = order.sub_orders?.filter((s) => s.status === "cancelled") ?? [];
  const isFullyCancelled = masterStatus === "cancelled";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Back */}
      <div className="mb-6">
        <Link
          to="/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
        >
          <ArrowLeft size={16} /> Back to My Orders
        </Link>
      </div>

      {/* Success banner */}
      {isSuccess && !isFullyCancelled && (
        <div className="mb-7 rounded-card border border-emerald-200 bg-emerald-50/90 p-5 text-emerald-900 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">Order Placed Successfully!</h2>
              <p className="mt-0.5 text-sm text-emerald-800">
                Thank you! Each seller has been notified and will prepare your shipment
                independently. You can track each one below.
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  className="bg-emerald-700 hover:bg-emerald-800"
                  onClick={() => navigate("/products")}
                >
                  Continue Shopping
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Notice (e.g. Seller just marked as shipped) */}
      {shippedNotice && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <Truck size={20} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold text-amber-950">Shipment Status Updated</p>
              <p className="mt-0.5 text-sm text-amber-800">{shippedNotice}</p>
            </div>
          </div>
          <button
            onClick={() => setShippedNotice(null)}
            className="text-xs font-bold text-amber-700 hover:text-amber-900"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Order Header */}
      <div className="rounded-card border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-ink sm:text-2xl">
                Order #{order.uid.slice(0, 8).toUpperCase()}
              </h1>
              <button
                onClick={copyOrderId}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                title="Copy Full Order ID"
              >
                {copied ? (
                  <Check size={12} className="text-emerald-600" />
                ) : (
                  <Copy size={12} />
                )}
                {copied ? "Copied" : "Copy ID"}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted sm:text-sm">
              <Clock size={15} /> Placed on {formatDate(order.created_at)}
            </p>
          </div>

          {/* Master status badge — derived, never from raw order.status alone */}
          <Badge tone={getMasterStatusTone(masterStatus)}>
            {getStatusLabel(masterStatus)}
          </Badge>
        </div>

        {/* Master status explanation when partially delivered */}
        {masterStatus === "partially_delivered" && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Truck size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p>
              <span className="font-bold">Some items have been delivered</span> while others are
              still on their way. Each shipment below has its own tracking status.
            </p>
          </div>
        )}

        {/* Cancelled notice - authoritative single banner */}
        {isFullyCancelled && (
          <div className="mt-5 flex items-start gap-3.5 rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5 text-red-900 shadow-sm">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
              <XCircle size={22} />
            </div>
            <div>
              <p className="text-base font-bold">This order was cancelled</p>
              <p className="mt-0.5 text-xs text-red-700 sm:text-sm leading-relaxed">
                No payment was charged, or any pre-authorised amount will be refunded to your original payment method.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Per-Shipment Tracking Cards ───────────────────────────────────── */}
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-bold text-ink">
          Shipment Tracking
          {order.sub_orders?.length > 1 && (
            <span className="ml-2 text-sm font-normal text-muted">
              ({order.sub_orders.length} separate shipments)
            </span>
          )}
        </h2>

        {order.sub_orders?.map((sub, idx) => (
          <section
            key={sub.uid}
            className="overflow-hidden rounded-card border border-line bg-white shadow-sm"
          >
            {/* Store header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/70 px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Store size={16} className="text-brand-600" />
                <span className="font-bold text-ink">
                  {sub.store_name || "Marketplace Seller"}
                </span>
                {order.sub_orders.length > 1 && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    Shipment {idx + 1}
                  </span>
                )}
                <span className="text-xs text-muted">
                  · Subtotal {formatCurrency(sub.subtotal)}
                </span>
              </div>
              <Badge tone={isFullyCancelled ? "neutral" : getStatusTone(sub.status)}>
                {getStatusLabel(sub.status)}
              </Badge>
            </div>

            {/* Shipment-specific stepper */}
            <div className="px-5 pb-5 pt-4 sm:px-6">
              <ShipmentTracker sub={sub} isOrderCancelled={isFullyCancelled} />
            </div>

            {/* Items inside this shipment */}
            <div className="divide-y divide-line border-t border-line px-5 sm:px-6">
              {sub.items?.map((item) => (
                <div
                  key={item.uid}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.product_slug ? (
                      <Link to={`/p/${item.product_slug}`} className="shrink-0">
                        <img
                          src={orderItemImage(item)}
                          alt={item.title_snapshot}
                          className="h-20 w-20 rounded-xl object-cover bg-slate-100 ring-1 ring-slate-200 transition hover:opacity-80 sm:h-24 sm:w-24"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://picsum.photos/seed/${encodeURIComponent(item.product_slug || item.uid || "item")}/400/400`;
                          }}
                        />
                      </Link>
                    ) : (
                      <img
                        src={orderItemImage(item)}
                        alt={item.title_snapshot}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover bg-slate-100 ring-1 ring-slate-200 sm:h-24 sm:w-24"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `https://picsum.photos/seed/${encodeURIComponent(item.uid || "item")}/400/400`;
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {item.product_slug ? (
                          <Link
                            to={`/p/${item.product_slug}`}
                            className="hover:text-brand-600 transition"
                          >
                            {item.title_snapshot}
                          </Link>
                        ) : (
                          item.title_snapshot
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatCurrency(item.price_snapshot)} &times; {item.quantity} unit
                        {item.quantity > 1 ? "s" : ""}
                      </p>
                      {/* Per-item delivery status pill (only shown when not fully cancelled to avoid duplicate clutter) */}
                      {!isFullyCancelled && (
                        <span
                          className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            sub.status === "delivered"
                              ? "bg-emerald-100 text-emerald-700"
                              : sub.status === "cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {sub.status === "delivered"
                            ? "✓ Delivered"
                            : sub.status === "cancelled"
                              ? "✗ Cancelled"
                              : getStatusLabel(sub.status)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 text-right">
                    <p className="break-words font-bold text-ink tabular-nums [overflow-wrap:anywhere]">
                      {formatCurrency(
                        item.line_total || Number(item.price_snapshot) * item.quantity,
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Bottom Grid: Delivery Address & Payment */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Delivery Address */}
        <div className="rounded-card border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <MapPin size={18} className="text-brand-600" />
            <h3 className="font-bold text-ink">Delivery Address</h3>
          </div>
          <div className="mt-3 text-sm leading-6 text-muted">
            <p className="font-bold text-ink">{order.address_snapshot?.name}</p>
            {order.address_snapshot?.phone && (
              <p className="text-xs font-medium text-slate-700">
                Phone: {order.address_snapshot.phone}
              </p>
            )}
            <p className="mt-1">
              {order.address_snapshot?.line1}
              {order.address_snapshot?.line2 && `, ${order.address_snapshot.line2}`}
            </p>
            <p>
              {order.address_snapshot?.city}, {order.address_snapshot?.state} —{" "}
              <span className="font-semibold text-ink">{order.address_snapshot?.pincode}</span>
            </p>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="rounded-card border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <CreditCard size={18} className="text-brand-600" />
            <h3 className="font-bold text-ink">Payment & Price Details</h3>
          </div>
          <div className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between text-muted">
              <span>Payment Method</span>
              <span className="font-medium uppercase text-ink">
                {order.payment_method === "cod" ? "Cash on Delivery" : order.payment_method}
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Payment Status</span>
              <Badge tone={order.payment_status === "paid" ? "success" : "warning"}>
                {order.payment_status}
              </Badge>
            </div>
            <div className="flex justify-between text-muted">
              <span>Delivery Charges</span>
              <span className="font-bold text-emerald-600">FREE</span>
            </div>
            <div className="border-t border-line pt-2.5 flex justify-between text-base font-bold text-ink">
              <span>Total Amount</span>
              <span className="text-brand-700">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation is available through confirmation, but never after shipping. */}
      {["placed", "confirmed"].includes(masterStatus) && (
        <div className="mt-6 rounded-card border border-line bg-white p-5 shadow-sm">
          {!confirmCancel ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-ink">Need to cancel this order?</h4>
                <p className="mt-0.5 text-xs text-muted">
                  You can cancel until a seller ships your order.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  setCancelError(null);
                  setConfirmCancel(true);
                }}
              >
                Cancel Order
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-red-900">
                    Are you sure you want to cancel this order?
                  </h4>
                  <p className="mt-1 text-xs text-red-700 leading-relaxed">
                    Once cancelled, this order cannot be reopened.
                  </p>

                  {/* Backend rejection error — shown inline, never swallowed */}
                  {cancelError && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-100 px-3 py-2 text-xs font-medium text-red-800">
                      <XCircle size={14} className="mt-0.5 shrink-0" />
                      {cancelError}
                    </div>
                  )}

                  <div className="mt-4 flex gap-3">
                    <Button
                      variant="danger"
                      loading={cancel.isPending}
                      onClick={() => cancel.mutate()}
                    >
                      Yes, Cancel My Order
                    </Button>
                    <Button
                      variant="outline"
                      disabled={cancel.isPending}
                      onClick={() => {
                        setConfirmCancel(false);
                        setCancelError(null);
                      }}
                    >
                      Keep Order
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Orders;
