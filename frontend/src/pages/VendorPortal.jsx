import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  GripVertical,
  LayoutDashboard,
  MapPin,
  Package,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Upload,
  WalletCards,
  X,
  ZoomIn,
} from "lucide-react";
import { listCategories } from "../api/catalog";
import {
  applyVendor,
  createVendorProduct,
  createVendorService,
  deleteVendorProduct,
  deleteVendorService,
  getAllVendorProducts,
  getAllVendorServices,
  getVendorOrders,
  getVendorProfile,
  updateVendorProduct,
  updateVendorService,
  updateVendorProfile,
  updateVendorSubOrderStatus,
  uploadVendorProductImages,
} from "../api/vendor";
import { BackLink, PageHeader } from "../components/Page";
import ProductPrice from "../components/ProductPrice";
import ProductGallery from "../components/ProductGallery";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
} from "../components/ui";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatDate, orderItemImage } from "../lib/formatters";

const LOW_STOCK_THRESHOLD = 5;

const navItems = [
  { to: "/vendor", label: "Overview", icon: LayoutDashboard },
  { to: "/vendor/orders", label: "Orders", icon: ShoppingBag },
  { to: "/vendor/products", label: "Products", icon: Package },
  { to: "/vendor/services", label: "Services", icon: Store },
  { to: "/vendor/settings", label: "Store settings", icon: Store },
];

export default function VendorPortal() {
  const profile = useQuery({
    queryKey: ["vendor-profile"],
    queryFn: getVendorProfile,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Seller centre
          </p>
          <h1 className="mt-1 text-2xl font-bold">Grow your store</h1>
        </div>
        <Link
          to="/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
        >
          <ExternalLink size={16} /> Browse Tavilo
        </Link>
      </div>
      <div className="grid gap-7 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-card border border-line bg-white p-3">
          <div className="mb-3 rounded-lg bg-brand-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Seller centre
            </p>
            <p className="mt-1 text-sm font-medium text-brand-900">
              {profile.data?.store_name || "Set up your store"}
            </p>
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink"
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>
          <Routes>
            <Route index element={<VendorOverview profile={profile} />} />
            <Route
              path="apply"
              element={<VendorApplication profile={profile} />}
            />
            <Route
              path="orders"
              element={<VendorOrders profile={profile} />}
            />
            <Route
              path="products"
              element={<VendorProducts profile={profile} />}
            />
            <Route
              path="services"
              element={<VendorServices profile={profile} />}
            />
            <Route
              path="settings"
              element={<VendorSettings profile={profile} />}
            />
            <Route path="*" element={<VendorOverview profile={profile} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function VendorOverview({ profile }) {
  if (profile.isLoading) return <LoadingPanel />;
  if (profile.isError) return <ApplicationPrompt />;
  if (profile.data.status !== "approved")
    return <PendingVendor profile={profile.data} />;
  return <ApprovedOverview vendor={profile.data} />;
}

function ApplicationPrompt() {
  return (
    <div className="rounded-card border border-line bg-white p-7 sm:p-10">
      <div className="grid gap-8 md:grid-cols-[1fr_260px] md:items-center">
        <div>
          <Badge tone="warning">Seller centre</Badge>
          <h2 className="mt-4 text-2xl font-bold">
            Turn your products into a business
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Create your store, submit it for review, and start listing products
            once approved. You keep control of your catalogue, pricing and
            inventory.
          </p>
          <Link
            to="/vendor/apply"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Become a vendor <ChevronRight size={17} />
          </Link>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            How it works
          </p>
          <div className="mt-4 space-y-4">
            {[
              "Submit store details",
              "Tavilo review",
              "List and sell products",
            ].map((label, index) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VendorApplication({ profile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const mutation = useMutation({
    mutationFn: applyVendor,
    onSuccess: (data) => {
      queryClient.setQueryData(["vendor-profile"], data);
      navigate("/vendor");
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  if (!profile.isError && profile.data)
    return (
      <div className="rounded-card border border-line bg-white p-7">
        <BackLink to="/vendor" />
        <StatusCard vendor={profile.data} />
      </div>
    );
  return (
    <div>
      <BackLink to="/vendor" />
      <PageHeader
        eyebrow="Become a vendor"
        title="Set up your store"
        description="Tell us about your business. Our team will review your application before your store goes live."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <form
          onSubmit={handleSubmit((data) => {
            setError("");
            mutation.mutate(data);
          })}
          className="rounded-card border border-line bg-white p-6 sm:p-7"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Store name"
              placeholder="e.g. Northstar Home"
              error={errors.store_name?.message}
              {...register("store_name", {
                required: "Store name is required",
                maxLength: {
                  value: 120,
                  message: "Keep it under 120 characters",
                },
              })}
            />
            <Input
              label="Store handle"
              placeholder="northstar-home"
              error={errors.slug?.message}
              {...register("slug", {
                required: "Store handle is required",
                pattern: {
                  value: /^[a-z0-9-]+$/,
                  message: "Use lowercase letters, numbers and hyphens",
                },
              })}
            />
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Store description</span>
              <textarea
                rows="5"
                placeholder="What do you sell and what makes your store special?"
                className="w-full rounded-lg border border-line bg-white px-3 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                {...register("description", {
                  maxLength: {
                    value: 500,
                    message: "Keep it under 500 characters",
                  },
                })}
              />
              {errors.description && (
                <span className="text-xs text-red-600">
                  {errors.description.message}
                </span>
              )}
            </label>
            <Input
              label="Logo URL (optional)"
              type="url"
              placeholder="https://..."
              error={errors.logo_url?.message}
              {...register("logo_url")}
            />
          </div>
          {error && (
            <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button className="mt-6" loading={isSubmitting || mutation.isPending}>
            Submit for review
          </Button>
        </form>
        <div className="h-fit rounded-card border border-brand-100 bg-brand-50 p-5">
          <p className="font-bold text-brand-900">Before you submit</p>
          <ul className="mt-4 space-y-3 text-sm leading-5 text-brand-800">
            <li>Use a clear store name customers will remember.</li>
            <li>Keep your handle short; it becomes your public store URL.</li>
            <li>You can update your description and logo after approval.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ vendor }) {
  const approved = vendor.status === "approved";
  const suspended = vendor.status === "suspended";
  return (
    <div className="mt-6 rounded-xl border border-line bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-9 w-9 place-items-center rounded-full ${approved ? "bg-emerald-100 text-emerald-700" : suspended ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
        >
          {approved ? <Check size={18} /> : <CircleAlert size={18} />}
        </span>
        <div>
          <p className="font-bold">Application {vendor.status}</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {approved
              ? "Your store is live. You can now manage products and inventory."
              : suspended
                ? "Your store is currently paused. Please contact support for next steps."
                : "Our team is reviewing your store details. We will let you know when it is ready."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PendingVendor({ profile }) {
  return (
    <div>
      <PageHeader
        eyebrow="Application status"
        title={profile.store_name}
        description="Your seller account is being prepared."
      />
      <div className="rounded-card border border-line bg-white p-6 sm:p-8">
        <StatusCard vendor={profile} />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["Submitted", true],
            ["Under review", profile.status === "pending"],
            ["Ready to sell", profile.status === "approved"],
          ].map(([label, done]) => (
            <div
              key={label}
              className={`rounded-lg border p-4 ${done ? "border-brand-100 bg-brand-50" : "border-line"}`}
            >
              <div
                className={`h-2 rounded-full ${done ? "bg-brand-600" : "bg-slate-200"}`}
              />
              <p className="mt-3 text-sm font-semibold">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApprovedOverview({ vendor }) {
  const products = useQuery({
    queryKey: ["vendor-products"],
    queryFn: getAllVendorProducts,
  });
  const ordersQuery = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: getVendorOrders,
  });
  const orderList = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  const pendingOrders = orderList.filter((o) => o.status === "placed");
  const items = products.data?.items || [];
  const active = items.filter((item) => item.status === "active");
  const lowStock = items.filter((item) => item.stock <= LOW_STOCK_THRESHOLD);
  const inventoryValue = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.stock || 0),
    0,
  );
  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome, ${vendor.store_name}`}
        description="Keep your catalogue fresh, process new orders, and monitor your inventory."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/vendor/orders"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              <ShoppingBag size={17} /> View Orders ({orderList.length})
            </Link>
            <Link
              to="/vendor/products"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus size={17} /> Add product
            </Link>
          </div>
        }
      />
      {products.isError ? (
        <ErrorState onRetry={products.refetch} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              icon={ShoppingBag}
              label="Total orders"
              value={orderList.length}
            />
            <Metric
              icon={CircleAlert}
              label="Action required"
              value={pendingOrders.length}
              tone={pendingOrders.length ? "warning" : "default"}
            />
            <Metric
              icon={Package}
              label="Total products"
              value={items.length}
            />
            <Metric
              icon={BarChart3}
              label="Live listings"
              value={active.length}
            />
            <Metric
              icon={WalletCards}
              label="Inventory value"
              value={formatCurrency(inventoryValue)}
            />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="space-y-6">
              {/* Recent Orders Section */}
              <section className="rounded-card border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-ink">Recent orders</h2>
                    <p className="text-xs text-muted">Orders placed for your store</p>
                  </div>
                  <Link
                    to="/vendor/orders"
                    className="text-sm font-semibold text-brand-600"
                  >
                    Manage all ({orderList.length})
                  </Link>
                </div>
                {ordersQuery.isLoading ? (
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : orderList.length ? (
                  <div className="mt-4 divide-y divide-line">
                    {orderList.slice(0, 4).map((subOrder) => (
                      <div
                        key={subOrder.uid}
                        className="flex items-center justify-between gap-3 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-ink">
                              #{subOrder.uid.slice(0, 8).toUpperCase()}
                            </span>
                            <Badge
                              tone={
                                subOrder.status === "delivered"
                                  ? "success"
                                  : subOrder.status === "cancelled"
                                    ? "danger"
                                    : subOrder.status === "placed"
                                      ? "warning"
                                      : "neutral"
                              }
                            >
                              {subOrder.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {subOrder.items?.map((i) => i.title_snapshot).join(", ")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-ink">
                            {formatCurrency(subOrder.subtotal)}
                          </p>
                          <Link
                            to="/vendor/orders"
                            className="text-xs font-medium text-brand-600 hover:underline"
                          >
                            Process &rarr;
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-sm text-muted">
                    No orders placed yet. Products you list will appear here when purchased.
                  </div>
                )}
              </section>

              {/* Recent Products Section */}
              <section className="rounded-card border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Recent products</h2>
                  <Link
                    to="/vendor/products"
                    className="text-sm font-semibold text-brand-600"
                  >
                    Manage all
                  </Link>
                </div>
              {products.isLoading ? (
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : items.length ? (
                <div className="mt-4 divide-y divide-line">
                  {items.slice(0, 5).map((product) => (
                    <div
                      key={product.uid}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {product.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                          {product.stock} units Â·{" "}
                          <ProductPrice
                            price={product.price}
                            mrp={product.mrp}
                            className="inline-flex"
                          />
                        </div>
                      </div>
                      <Badge
                        tone={
                          product.stock <= LOW_STOCK_THRESHOLD
                            ? "warning"
                            : "success"
                        }
                      >
                        {product.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No products yet"
                  description="Add your first product to start selling."
                  action={
                    <Link
                      to="/vendor/products"
                      className="text-sm font-semibold text-brand-600"
                    >
                      Add a product
                    </Link>
                  }
                />
              )}
            </section>
          </div>
          <section className="rounded-card border border-line bg-brand-700 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
                Store health
              </p>
              <p className="mt-3 text-3xl font-bold">
                {active.length ? "Ready" : "Start listing"}
              </p>
              <p className="mt-2 text-sm leading-6 text-blue-100">
                {active.length
                  ? "Your store has live products customers can discover."
                  : "Complete your catalogue with titles, images, prices and stock."}
              </p>
              <Link
                to="/vendor/settings"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-blue-100"
              >
                Edit store profile <ChevronRight size={16} />
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = "default" }) {
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={18} />
        </span>
        {tone === "warning" && <Badge tone="warning">Attention</Badge>}
      </div>
      <p className="mt-5 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

function VendorProducts({ profile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const products = useQuery({
    queryKey: ["vendor-products"],
    queryFn: getAllVendorProducts,
    enabled: profile.data?.status === "approved",
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    enabled: profile.data?.status === "approved",
  });
  const remove = useMutation({
    mutationFn: deleteVendorProduct,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] }),
    onError: (e) => setError(getErrorMessage(e)),
  });
  if (profile.isLoading) return <LoadingPanel />;
  if (profile.isError) return <ApplicationPrompt />;
  if (profile.data.status !== "approved")
    return <PendingVendor profile={profile.data} />;
  const items = products.data?.items || [];
  return (
    <div>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Create, edit and archive the products shown in your store."
        action={
          <Button
            onClick={() => {
              setError("");
              setEditing({});
            }}
          >
            <Plus size={17} /> Add product
          </Button>
        }
      />
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {products.isLoading ? (
        <LoadingPanel />
      ) : products.isError ? (
        <ErrorState onRetry={products.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your catalogue is empty"
          description="Add a product with a price, stock level and at least one image."
          action={
            <Button onClick={() => setEditing({})}>
              Add your first product
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="hidden grid-cols-[1fr_110px_100px_120px_100px] gap-4 border-b border-line bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted sm:grid">
            <span>Product</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {items.map((product) => (
            <div
              key={product.uid}
              className="grid gap-3 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-[1fr_110px_100px_120px_100px] sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {product.title}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {product.sku || product.slug}
                </p>
              </div>
              <ProductPrice
                price={product.price}
                mrp={product.mrp}
                className="text-sm"
              />
              <p
                className={`text-sm ${product.stock <= LOW_STOCK_THRESHOLD ? "font-semibold text-amber-700" : ""}`}
              >
                {product.stock}
              </p>
              <Badge
                tone={
                  product.status === "active"
                    ? "success"
                    : product.status === "archived"
                      ? "danger"
                      : "warning"
                }
              >
                {product.status}
              </Badge>
              <div className="flex justify-end gap-1">
                <button
                  aria-label={`Edit ${product.title}`}
                  onClick={() => {
                    setError("");
                    setEditing(product);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  aria-label={`Archive ${product.title}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Archive this product? It will disappear from your storefront.",
                      )
                    )
                      remove.mutate(product.uid);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ProductEditor
          product={editing.uid ? editing : null}
          categories={categories.data || []}
          onClose={() => setEditing(null)}
          onSaved={(updatedProduct) => {
            setEditing(null);
            if (updatedProduct?.uid) {
              queryClient.setQueryData(["vendor-products"], (current) => {
                if (!current?.items) return current;
                return {
                  ...current,
                  items: current.items.map((item) =>
                    item.uid === updatedProduct.uid ? updatedProduct : item,
                  ),
                };
              });
            }
            queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
          }}
        />
      )}
    </div>
  );
}

function VendorServices({ profile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const services = useQuery({
    queryKey: ["vendor-services"],
    queryFn: getAllVendorServices,
    enabled: profile.data?.status === "approved",
  });
  const remove = useMutation({
    mutationFn: deleteVendorService,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["vendor-services"] }),
    onError: (e) => setError(getErrorMessage(e)),
  });
  if (profile.isLoading) return <LoadingPanel />;
  if (profile.isError) return <ApplicationPrompt />;
  if (profile.data.status !== "approved")
    return <PendingVendor profile={profile.data} />;
  const items = services.data?.items || [];
  return (
    <div>
      <PageHeader
        eyebrow="Service catalogue"
        title="Services"
        description="List the services your store provides with a price and duration."
        action={
          <Button
            onClick={() => {
              setError("");
              setEditing({});
            }}
          >
            <Plus size={17} /> Add service
          </Button>
        }
      />
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {services.isLoading ? (
        <LoadingPanel />
      ) : services.isError ? (
        <ErrorState onRetry={services.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add your first service to show customers what you offer."
          action={
            <Button onClick={() => setEditing({})}>
              Add your first service
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          {items.map((item) => (
            <div
              key={item.uid}
              className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatCurrency(item.price)} Â· {item.duration_minutes}{" "}
                  minutes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={item.status === "active" ? "success" : "warning"}>
                  {item.status}
                </Badge>
                <button
                  aria-label={`Edit ${item.title}`}
                  onClick={() => {
                    setError("");
                    setEditing(item);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  aria-label={`Archive ${item.title}`}
                  onClick={() => {
                    if (window.confirm("Archive this service?"))
                      remove.mutate(item.uid);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ServiceEditor
          service={editing.uid ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["vendor-services"] });
          }}
        />
      )}
    </div>
  );
}

function ServiceEditor({ service, onClose, onSaved }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState(() =>
    service
      ? {
          title: service.title || "",
          slug: service.slug || "",
          description: service.description || "",
          price: service.price || "",
          duration_minutes: service.duration_minutes || 60,
          image_urls: (service.images || [])
            .map((image) => image.url)
            .join("\n"),
        }
      : {
          title: "",
          slug: "",
          description: "",
          price: "",
          duration_minutes: 60,
          image_urls: "",
        },
  );
  const mutation = useMutation({
    mutationFn: (payload) =>
      service
        ? updateVendorService(service.uid, payload)
        : createVendorService(payload),
    onSuccess: (updatedProduct) => {
      onSaved(updatedProduct);
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    setError("");
    if (!form.title.trim() || !form.slug.trim() || !form.price)
      return setError("Title, slug and price are required.");
    mutation.mutate({
      ...form,
      price: Number(form.price),
      duration_minutes: Number(form.duration_minutes),
      image_urls: form.image_urls
        .split(/[,\n]/)
        .map((url) => url.trim())
        .filter(Boolean),
    });
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-8 max-w-2xl rounded-card bg-white p-6 shadow-float sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              {service ? "Edit service" : "New service"}
            </p>
            <h2 className="mt-2 text-xl font-bold">
              {service ? service.title : "Add a service"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Service title"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="What service do you provide?"
          />
          <Input
            label="URL slug"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            placeholder="service-name"
          />
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <Input
            label="Price"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
          />
          <Input
            label="Duration (minutes)"
            type="number"
            min="1"
            value={form.duration_minutes}
            onChange={(e) => update("duration_minutes", e.target.value)}
          />
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Image URLs</span>
            <textarea
              rows="3"
              value={form.image_urls}
              onChange={(e) => update("image_urls", e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Paste one image URL per line"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={mutation.isPending}>
              {service ? "Save changes" : "Publish service"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductEditor({ product, categories, onClose, onSaved }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState(() =>
    product ? toForm(product) : blankProduct(),
  );
  const [images, setImages] = useState(() =>
    product ? (product.images || []).map((image) => image.url) : [],
  );
  const [uploading, setUploading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const mutation = useMutation({
    mutationFn: (payload) =>
      product
        ? updateVendorProduct(product.uid, payload)
        : createVendorProduct(payload),
    onSuccess: onSaved,
    onError: (e) => setError(getErrorMessage(e)),
  });
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (images.length + files.length > 10) {
      setError("You can add up to 10 product photos.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const data = await uploadVendorProductImages(files);
      setImages((current) => [...current, ...data.images]);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };
  const removeImage = (index) => {
    setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
    setPreviewIndex((current) => {
      if (current === index) return null;
      return current !== null && current > index ? current - 1 : current;
    });
  };
  const moveImage = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setImages((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const submit = (event) => {
    event.preventDefault();
    setError("");
    if (!form.title.trim() || !form.slug.trim() || !form.price)
      return setError("Title, slug and price are required.");
    const sellingPrice = Number(form.price);
    const maximumRetailPrice = form.mrp === "" ? null : Number(form.mrp);
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0)
      return setError("Selling price must be greater than zero.");
    if (
      maximumRetailPrice !== null &&
      (!Number.isFinite(maximumRetailPrice) || maximumRetailPrice < sellingPrice)
    )
      return setError("MRP must be greater than or equal to the selling price.");
    mutation.mutate({
      ...form,
      price: Number(form.price),
      mrp: form.mrp ? Number(form.mrp) : null,
      stock: Number(form.stock || 0),
      category_id: form.category_id || null,
      image_urls: images,
    });
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-8 max-w-2xl rounded-card bg-white p-6 shadow-float sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              {product ? "Edit listing" : "New listing"}
            </p>
            <h2 className="mt-2 text-xl font-bold">
              {product ? product.title : "Add a product"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Product title"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="What are you selling?"
          />
          <Input
            label="URL slug"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            placeholder="product-name"
          />
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Explain why customers will love it"
            />
          </label>
          <Input
            label="Selling price"
            type="number"
            min="0.01"
            step="0.01"
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
          />
          <Input
            label="MRP (optional)"
            type="number"
            min="0"
            step="0.01"
            value={form.mrp}
            onChange={(e) => update("mrp", e.target.value)}
          />
          {form.price && (
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Customer price preview
              </p>
              <ProductPrice
                price={form.price}
                mrp={form.mrp}
                className="mt-1"
              />
              {form.mrp && Number(form.mrp) < Number(form.price) && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  MRP must be greater than or equal to the selling price.
                </p>
              )}
            </div>
          )}
          <Input
            label="Stock quantity"
            type="number"
            min="0"
            value={form.stock}
            onChange={(e) =>
              update(
                "stock",
                e.target.value === "" ? "" : Number.parseInt(e.target.value, 10),
              )
            }
          />
          <Input
            label="SKU (optional)"
            value={form.sku}
            onChange={(e) => update("sku", e.target.value)}
          />
          <Select
            label="Category"
            value={form.category_id}
            onChange={(e) => update("category_id", e.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.uid} value={category.uid}>
                {category.name}
              </option>
            ))}
          </Select>
          {product && (
            <Select
              label="Listing status"
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </Select>
          )}
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Product photos</span>
            <span className="block text-xs text-muted">
              Upload up to 10 photos. Images are automatically compressed for storage.
            </span>
            <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-slate-50 text-center transition hover:border-brand-500 hover:bg-brand-50">
              <Upload size={22} className="text-brand-600" />
              <span className="mt-1 text-sm font-semibold text-ink">
                {uploading ? "Uploading and compressing..." : "Choose product photos"}
              </span>
              <span className="text-xs text-muted">JPG, PNG or WebP, up to 10 MB each</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={handleImageUpload}
                className="sr-only"
              />
            </label>
            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveImage(Number(event.dataTransfer.getData("text/plain")), index);
                    }}
                    onClick={() => setPreviewIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setPreviewIndex(index);
                      }
                    }}
                    role="button"
                    tabIndex="0"
                    aria-label={`Preview product photo ${index + 1}`}
                    aria-current={previewIndex === index ? "true" : undefined}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${previewIndex === index ? "border-brand-600 shadow-[0_0_0_2px_rgba(11,181,176,0.18)]" : "border-line"}`}
                  >
                    <img src={url} alt={`Product photo ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 opacity-0 transition group-hover:opacity-100">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setPreviewIndex(index); }} className="rounded p-1 text-white hover:bg-white/20" aria-label="Zoom image">
                        <ZoomIn size={16} />
                      </button>
                      <span className="p-1 text-white" title="Drag to reorder"><GripVertical size={16} /></span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeImage(index); }} className="rounded p-1 text-white hover:bg-red-500" aria-label="Remove image">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={mutation.isPending || uploading} disabled={uploading}>
              {product ? "Save changes" : "Publish product"}
            </Button>
          </div>
        </form>
      </div>
      {previewIndex !== null && images[previewIndex] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 sm:p-8" onClick={() => setPreviewIndex(null)}>
          <button type="button" onClick={() => setPreviewIndex(null)} className="absolute right-5 top-5 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close image preview">
            <X size={24} />
          </button>
          <div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <ProductGallery
              images={images}
              fallback={images[0]}
              alt={form.title || "Product preview"}
              initialIndex={previewIndex}
              onIndexChange={setPreviewIndex}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VendorSettings({ profile }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const vendor = profile.data;
  const [form, setForm] = useState(() =>
    vendor
      ? {
          store_name: vendor.store_name,
          description: vendor.description || "",
          logo_url: vendor.logo_url || "",
        }
      : {},
  );
  useEffect(() => {
    if (vendor)
      setForm({
        store_name: vendor.store_name,
        description: vendor.description || "",
        logo_url: vendor.logo_url || "",
      });
  }, [vendor]);
  const mutation = useMutation({
    mutationFn: updateVendorProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(["vendor-profile"], data);
      setMessage("Store profile saved.");
      setError("");
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  if (profile.isLoading) return <LoadingPanel />;
  if (profile.isError) return <ApplicationPrompt />;
  return (
    <div>
      <BackLink to="/vendor" />
      <PageHeader
        eyebrow="Store settings"
        title="Store profile"
        description="These details are shown on your public storefront."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(form);
        }}
        className="max-w-2xl rounded-card border border-line bg-white p-6 sm:p-7"
      >
        <Input
          label="Store name"
          value={form.store_name}
          onChange={(e) => setForm({ ...form, store_name: e.target.value })}
        />
        <label className="mt-5 block space-y-1.5">
          <span className="text-sm font-medium">Description</span>
          <textarea
            rows="5"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-line px-3 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <div className="mt-5">
          <Input
            label="Logo URL"
            type="url"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          />
        </div>
        {message && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="mt-6" loading={mutation.isPending}>
          Save profile
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted">
        Application submitted {formatDate(vendor.created_at)} Â· Store handle /
        {vendor.slug}
      </p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
function blankProduct() {
  return {
    title: "",
    slug: "",
    description: "",
    price: "",
    mrp: "",
    stock: 0,
    sku: "",
    category_id: "",
    status: "active",
  };
}
function toForm(product) {
  return {
    title: product.title || "",
    slug: product.slug || "",
    description: product.description || "",
    price: product.price || "",
    mrp: product.mrp || "",
    stock: product.stock ?? 0,
    sku: product.sku || "",
    category_id: product.category?.uid || "",
    status: product.status || "active",
  };
}

function VendorOrders({ profile }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [cancelModalSubUid, setCancelModalSubUid] = useState(null);

  const ordersQuery = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: getVendorOrders,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ subUid, status }) =>
      updateVendorSubOrderStatus(subUid, status),
    onSuccess: () => {
      setCancelModalSubUid(null);
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
    },
  });

  const copyToClipboard = (text, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigator.clipboard?.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (ordersQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (ordersQuery.isError) {
    return <ErrorState onRetry={ordersQuery.refetch} />;
  }

  const rawOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];

  const filteredOrders = rawOrders.filter((order) => {
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "action_required"
          ? order.status === "placed"
          : order.status === statusFilter;

    if (!matchesStatus) return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    const idMatch =
      order.uid?.toLowerCase().includes(q) ||
      order.order_id?.toLowerCase().includes(q);
    const customerMatch =
      order.address_snapshot?.name?.toLowerCase().includes(q) ||
      order.address_snapshot?.phone?.toLowerCase().includes(q) ||
      order.address_snapshot?.city?.toLowerCase().includes(q);
    const itemMatch = order.items?.some((i) =>
      i.title_snapshot?.toLowerCase().includes(q)
    );

    return idMatch || customerMatch || itemMatch;
  });

  const actionRequiredCount = rawOrders.filter(
    (o) => o.status === "placed"
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Seller Fulfillment"
        title="Order Management"
        description="Process store orders, manage fulfillment steps, and keep customer deliveries on track."
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-600 animate-pulse" />
              {rawOrders.length} Total Orders
            </span>
          </div>
        }
      />

      {/* Quick Status Highlights */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase text-muted">New Orders</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-ink">
              {rawOrders.filter((o) => o.status === "placed").length}
            </span>
            {actionRequiredCount > 0 && (
              <Badge tone="warning">Action Needed</Badge>
            )}
          </div>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase text-muted">Confirmed (Packing)</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {rawOrders.filter((o) => o.status === "confirmed").length}
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase text-muted">In Transit (Shipped)</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {rawOrders.filter((o) => o.status === "shipped").length}
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-semibold uppercase text-muted">Completed (Delivered)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {rawOrders.filter((o) => o.status === "delivered").length}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search by Order ID, Customer name, City, or Product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 text-sm">
          {[
            { id: "all", label: `All (${rawOrders.length})` },
            {
              id: "action_required",
              label: `New Orders (${actionRequiredCount})`,
            },
            { id: "confirmed", label: "Confirmed" },
            { id: "shipped", label: "Shipped" },
            { id: "delivered", label: "Delivered" },
            { id: "cancelled", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
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

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-line bg-white p-12 text-center">
          <ShoppingBag size={40} className="mx-auto text-slate-300" />
          <h3 className="mt-4 font-semibold text-ink">No orders found</h3>
          <p className="mt-1 text-sm text-muted">
            {searchQuery
              ? "No orders match your search criteria. Try a different term or clear filters."
              : "When customers place orders for products from your store, they will appear here."}
          </p>
          {(searchQuery || statusFilter !== "all") && (
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
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {filteredOrders.map((subOrder) => {
            const isPlaced = subOrder.status === "placed";
            const isConfirmed = subOrder.status === "confirmed";
            const isShipped = subOrder.status === "shipped";
            const isDelivered = subOrder.status === "delivered";
            const isCancelled = subOrder.status === "cancelled";

            const isPendingThis =
              updateStatusMutation.isPending &&
              updateStatusMutation.variables?.subUid === subOrder.uid;

            const addr = subOrder.address_snapshot || {};

            return (
              <div
                key={subOrder.uid}
                className="overflow-hidden rounded-card border border-line bg-white shadow-sm transition hover:border-slate-300"
              >
                {/* Header Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/70 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        SubOrder ID
                      </span>
                      <div className="flex items-center gap-1 font-mono font-medium text-ink">
                        <span>#{subOrder.uid.slice(0, 8).toUpperCase()}</span>
                        <button
                          onClick={(e) => copyToClipboard(subOrder.uid, e)}
                          title="Copy SubOrder UID"
                          className="text-slate-400 hover:text-brand-600"
                        >
                          {copiedId === subOrder.uid ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="hidden h-7 w-px bg-slate-200 sm:block" />

                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Parent Order
                      </span>
                      <div className="flex items-center gap-1 font-mono text-xs text-muted">
                        <span>#{subOrder.order_id?.slice(0, 8).toUpperCase()}</span>
                        <button
                          onClick={(e) => copyToClipboard(subOrder.order_id, e)}
                          title="Copy Parent Order UID"
                          className="hover:text-brand-600"
                        >
                          {copiedId === subOrder.order_id ? (
                            <Check size={11} className="text-emerald-600" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="hidden h-7 w-px bg-slate-200 sm:block" />

                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Date Placed
                      </span>
                      <p className="font-medium text-ink">
                        {formatDate(subOrder.created_at)}
                      </p>
                    </div>

                    <div className="hidden h-7 w-px bg-slate-200 sm:block" />

                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Payment
                      </span>
                      <p className="font-medium text-ink capitalize">
                        {subOrder.payment_method === "online_mock"
                          ? "Online (Paid)"
                          : "Cash on Delivery"}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <Badge
                      tone={
                        isDelivered
                          ? "success"
                          : isCancelled
                            ? "danger"
                            : isShipped || isConfirmed
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {subOrder.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-5">
                  <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                    {/* Items Section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                        Ordered Items ({subOrder.items?.length || 0})
                      </h4>
                      <div className="mt-3 divide-y divide-line rounded-lg border border-line">
                        {(subOrder.items || []).map((item) => (
                          <div
                            key={item.uid}
                            className="flex items-center justify-between gap-3 p-3 text-sm"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <img
                                src={orderItemImage(item)}
                                alt={item.title_snapshot}
                                className="h-9 w-9 shrink-0 rounded-md object-cover bg-slate-100"
                                onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${encodeURIComponent(item.product_slug || item.uid || 'item')}/400/400`; }}
                              />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-ink">
                                  {item.title_snapshot}
                                </p>
                                <p className="mt-0.5 text-xs text-muted">
                                  Unit Price: {formatCurrency(item.price_snapshot)} &times; Qty {item.quantity}
                                </p>
                              </div>
                            </div>
                            <div className="text-right font-bold text-ink">
                              {formatCurrency(
                                item.line_total ||
                                  Number(item.price_snapshot) * item.quantity
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-muted">Store Subtotal:</span>
                        <span className="text-lg font-bold text-ink">
                          {formatCurrency(subOrder.subtotal)}
                        </span>
                      </div>
                    </div>

                    {/* Customer & Shipping Section */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                        <MapPin size={14} /> Shipping Destination
                      </h4>
                      <div className="mt-2 space-y-1 text-ink">
                        <p className="font-semibold text-base">
                          {addr.name || "Customer"}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Phone size={12} /> {addr.phone || "No phone provided"}
                        </p>
                        <p className="text-xs leading-5 text-slate-600 pt-1">
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ""}
                          <br />
                          {addr.city}, {addr.state} — {addr.pincode}
                        </p>
                      </div>

                      {/* Parent Order Tracking status indicator */}
                      {subOrder.parent_order_status && (
                        <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-muted">
                          Customer Tracking Bar Status:{" "}
                          <span className="font-semibold text-ink capitalize">
                            {subOrder.parent_order_status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <div className="text-xs text-muted">
                      {isPlaced && "Customer is awaiting order confirmation."}
                      {isConfirmed && "Order is confirmed. Prepare packaging and mark shipped once dispatched."}
                      {isShipped && "Package is in transit. Mark delivered once received by customer."}
                      {isDelivered && "Order fulfillment successfully completed."}
                      {isCancelled && "This order has been cancelled."}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {isPlaced && (
                        <>
                          <Button
                            variant="primary"
                            className="gap-2 bg-brand-600 hover:bg-brand-700"
                            loading={isPendingThis && updateStatusMutation.variables?.status === "confirmed"}
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              updateStatusMutation.mutate({
                                subUid: subOrder.uid,
                                status: "confirmed",
                              })
                            }
                          >
                            <Check size={16} /> Confirm Order
                          </Button>

                          <Button
                            variant="outline"
                            className="gap-1 text-red-600 hover:bg-red-50 hover:border-red-200"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => setCancelModalSubUid(subOrder.uid)}
                          >
                            <X size={15} /> Cancel
                          </Button>
                        </>
                      )}

                      {isConfirmed && (
                        <>
                          <Button
                            variant="primary"
                            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                            loading={isPendingThis && updateStatusMutation.variables?.status === "shipped"}
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              updateStatusMutation.mutate({
                                subUid: subOrder.uid,
                                status: "shipped",
                              })
                            }
                          >
                            <Truck size={16} /> Mark as Shipped
                          </Button>

                          <Button
                            variant="outline"
                            className="gap-1 text-red-600 hover:bg-red-50 hover:border-red-200"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => setCancelModalSubUid(subOrder.uid)}
                          >
                            <X size={15} /> Cancel
                          </Button>
                        </>
                      )}

                      {isShipped && (
                        <Button
                          variant="primary"
                          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                          loading={isPendingThis && updateStatusMutation.variables?.status === "delivered"}
                          disabled={updateStatusMutation.isPending}
                          onClick={() =>
                            updateStatusMutation.mutate({
                              subUid: subOrder.uid,
                              status: "delivered",
                            })
                          }
                        >
                          <CheckCircle2 size={16} /> Mark as Delivered
                        </Button>
                      )}

                      {isDelivered && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={15} /> Fulfilled & Delivered
                        </div>
                      )}

                      {isCancelled && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <X size={15} /> Order Cancelled
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelModalSubUid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-red-100">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-ink">Cancel SubOrder?</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Are you sure you want to cancel this order? The reserved inventory stock will be automatically restored to your catalogue.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={updateStatusMutation.isPending}
                onClick={() => setCancelModalSubUid(null)}
              >
                Go Back
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
                loading={updateStatusMutation.isPending}
                onClick={() =>
                  updateStatusMutation.mutate({
                    subUid: cancelModalSubUid,
                    status: "cancelled",
                  })
                }
              >
                Yes, Cancel Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
