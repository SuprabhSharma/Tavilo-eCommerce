import { useState } from "react";
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
  Star,
  ExternalLink,
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

// Helper for status colors
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
    default:
      return status || "Processing";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER ORDERS LIST PAGE (/orders)
// ─────────────────────────────────────────────────────────────────────────────

export function Orders() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
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

  // Filter orders by search & status
  const filteredOrders = rawOrders.filter((order) => {
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "in_progress"
          ? ["placed", "confirmed", "shipped"].includes(order.status)
          : order.status === statusFilter;

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
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            My Orders
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track, view invoice details, and manage your recent purchases
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
            description="Explore our catalog and find something you love. All your orders and deliveries will appear right here."
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
          {/* Search & Filter Controls */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search by Order ID or Product name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 text-sm">
              {[
                { id: "all", label: `All (${rawOrders.length})` },
                {
                  id: "in_progress",
                  label: "In Progress",
                },
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

          {/* Results Summary */}
          {filteredOrders.length === 0 ? (
            <div className="mt-10 rounded-card border border-dashed border-line bg-white p-12 text-center">
              <Package size={40} className="mx-auto text-slate-300" />
              <h3 className="mt-4 font-semibold text-ink">
                No orders match your filter
              </h3>
              <p className="mt-1 text-sm text-muted">
                Try searching with a different term or resetting the filter.
              </p>
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
                const totalItemCount =
                  order.sub_orders?.reduce(
                    (acc, sub) =>
                      acc +
                      (sub.items?.reduce(
                        (iAcc, item) => iAcc + (item.quantity || 1),
                        0,
                      ) || 0),
                    0,
                  ) || 0;

                const storeCount = order.sub_orders?.length || 1;

                return (
                  <div
                    key={order.uid}
                    className="overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:border-brand-200 hover:shadow-float"
                  >
                    {/* Keep the parent order summary small and scannable. */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Badge tone={getStatusTone(order.status)}>
                          {getStatusLabel(order.status)}
                        </Badge>
                        <span className="text-sm text-muted">
                          Placed {formatDate(order.created_at)}
                        </span>
                        <span className="hidden text-slate-300 sm:inline">•</span>
                        <span className="text-sm text-muted">
                          {totalItemCount} item{totalItemCount !== 1 ? "s" : ""}
                          {storeCount > 1 ? ` from ${storeCount} stores` : ""}
                        </span>
                      </div>
                      <p className="text-base font-bold text-ink">
                        {formatCurrency(order.total)}
                      </p>
                    </div>

                    {/* Seller groups create a clear hierarchy without exposing database IDs. */}
                    <div className="divide-y divide-line">
                      {order.sub_orders?.map((sub) => (
                        <div key={sub.uid} className="px-5 py-5 sm:px-6">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Store size={17} className="text-brand-600" />
                              <span className="font-bold text-ink">
                                {sub.store_name || "Marketplace seller"}
                              </span>
                              <span className="text-muted">
                                · {sub.items?.length || 0} item{sub.items?.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <Badge tone={getStatusTone(sub.status)}>
                              {getStatusLabel(sub.status)}
                            </Badge>
                          </div>

                          <div className="space-y-4">
                            {sub.items?.map((item) => (
                              <div key={item.uid} className="flex gap-4 sm:gap-5">
                                <Link
                                  to={item.product_slug ? `/p/${item.product_slug}` : `/orders/${order.uid}`}
                                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 transition hover:ring-brand-300 sm:h-28 sm:w-28"
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
                                    to={item.product_slug ? `/p/${item.product_slug}` : `/orders/${order.uid}`}
                                    className="line-clamp-2 text-sm font-semibold leading-5 text-ink transition hover:text-brand-700 sm:text-base"
                                  >
                                    {item.title_snapshot}
                                  </Link>
                                  <p className="mt-2 text-sm text-muted">
                                    Qty: {item.quantity}
                                  </p>
                                  <p className="mt-1 text-base font-bold text-ink">
                                    {formatCurrency(
                                      item.line_total || Number(item.price_snapshot) * item.quantity,
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
                        View order details
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

// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAIL & TRACKING PAGE (/orders/:id & /orders/:id/success)
// ─────────────────────────────────────────────────────────────────────────────

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Check if route is /orders/:id/success or state has success flag
  const isSuccess =
    location.pathname.endsWith("/success") || Boolean(location.state?.order);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    initialData: location.state?.order,
  });

  const cancel = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: (data) => {
      setConfirmCancel(false);
      queryClient.setQueryData(["order", id], data);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
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

  const copyOrderId = () => {
    navigator.clipboard?.writeText(order.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Flipkart style tracking steps
  const steps = [
    { key: "placed", label: "Order Placed", icon: CheckCircle2 },
    { key: "confirmed", label: "Confirmed", icon: ShieldCheck },
    { key: "shipped", label: "Shipped", icon: Truck },
    { key: "delivered", label: "Delivered", icon: Package },
  ];

  const currentStepIndex =
    order.status === "cancelled"
      ? -1
      : steps.findIndex((s) => s.key === order.status);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Back button */}
      <div className="mb-6">
        <Link
          to="/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
        >
          <ArrowLeft size={16} /> Back to My Orders
        </Link>
      </div>

      {/* Success Banner if redirected from checkout */}
      {isSuccess && order.status !== "cancelled" && (
        <div className="mb-7 rounded-card border border-emerald-200 bg-emerald-50/90 p-5 text-emerald-900 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">Order Placed Successfully!</h2>
              <p className="mt-0.5 text-sm text-emerald-800">
                Thank you for your purchase. We have notified our seller partners
                and your package will be dispatched soon.
              </p>
              <div className="mt-3 flex gap-3">
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

      {/* Order Main Header */}
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
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy ID"}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted sm:text-sm">
              <Clock size={15} /> Placed on {formatDate(order.created_at)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge tone={getStatusTone(order.status)}>
              {getStatusLabel(order.status)}
            </Badge>
          </div>
        </div>

        {/* Status Stepper / Progress Bar (Flipkart Style) */}
        {order.status === "cancelled" ? (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <XCircle size={24} className="shrink-0 text-red-600" />
            <div>
              <p className="font-bold">This order was cancelled</p>
              <p className="mt-0.5 text-xs text-red-700">
                No payment was charged, or any pre-authorized charge will be
                refunded to the original payment source.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-8 border-t border-line pt-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              Delivery Progress
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = currentStepIndex >= idx;
                const isCurrent = currentStepIndex === idx;

                return (
                  <div key={step.key} className="flex flex-col items-center">
                    <div
                      className={`grid h-10 w-10 place-items-center rounded-full border-2 transition ${
                        isPassed
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-200 bg-slate-100 text-slate-400"
                      } ${isCurrent ? "ring-4 ring-emerald-100" : ""}`}
                    >
                      <Icon size={18} />
                    </div>
                    <span
                      className={`mt-2 text-xs font-semibold ${
                        isPassed ? "text-ink" : "text-muted"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sub-Orders by Seller (Multi-Vendor Aware) */}
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-bold text-ink">Items in your Order</h2>
        {order.sub_orders?.map((sub) => (
          <section
            key={sub.uid}
            className="overflow-hidden rounded-card border border-line bg-white shadow-sm"
          >
            {/* Store Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/70 px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Store size={17} className="text-brand-600" />
                <span className="font-bold text-ink">
                  {sub.store_name || "Vendor Store"}
                </span>
                <span className="text-xs text-muted">
                  (Store Subtotal: {formatCurrency(sub.subtotal)})
                </span>
              </div>
              <Badge tone={getStatusTone(sub.status)}>
                {getStatusLabel(sub.status)}
              </Badge>
            </div>

            {/* Items inside this Sub-Order */}
            <div className="divide-y divide-line px-5">
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
                          className="h-24 w-24 rounded-xl object-cover bg-slate-100 ring-1 ring-slate-200 transition hover:opacity-80 sm:h-28 sm:w-28"
                          onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${encodeURIComponent(item.product_slug || item.uid || 'item')}/400/400`; }}
                        />
                      </Link>
                    ) : (
                      <img
                        src={orderItemImage(item)}
                        alt={item.title_snapshot}
                        className="h-24 w-24 shrink-0 rounded-xl object-cover bg-slate-100 ring-1 ring-slate-200 sm:h-28 sm:w-28"
                        onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${encodeURIComponent(item.uid || 'item')}/400/400`; }}
                      />
                    )}
                    <div>
                      <p className="font-semibold text-ink">
                        {item.product_slug ? (
                          <Link to={`/p/${item.product_slug}`} className="hover:text-brand-600 transition">
                            {item.title_snapshot}
                          </Link>
                        ) : (
                          item.title_snapshot
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Price: {formatCurrency(item.price_snapshot)} &times; {item.quantity} unit{item.quantity > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-ink">
                      {formatCurrency(
                        item.line_total ||
                          Number(item.price_snapshot) * item.quantity,
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Bottom Grid: Delivery Address & Payment Summary */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Delivery Address Card */}
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
              <span className="font-semibold text-ink">
                {order.address_snapshot?.pincode}
              </span>
            </p>
          </div>
        </div>

        {/* Payment & Price Summary (Flipkart Style) */}
        <div className="rounded-card border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <CreditCard size={18} className="text-brand-600" />
            <h3 className="font-bold text-ink">Payment & Price Details</h3>
          </div>
          <div className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between text-muted">
              <span>Payment Method</span>
              <span className="font-medium uppercase text-ink">
                {order.payment_method === "cod"
                  ? "Cash on Delivery"
                  : order.payment_method}
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

      {/* Cancellation Section (Flipkart / Industry standard: only when placed) */}
      {order.status === "placed" && (
        <div className="mt-6 rounded-card border border-line bg-white p-5 shadow-sm">
          {!confirmCancel ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-ink">Need to cancel this order?</h4>
                <p className="mt-0.5 text-xs text-muted">
                  You can cancel as long as the order has not been confirmed or shipped by the seller.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => setConfirmCancel(true)}
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
                    Once cancelled, this order cannot be reopened. Any items
                    reserved will be returned to store inventory.
                  </p>
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
                      onClick={() => setConfirmCancel(false)}
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
