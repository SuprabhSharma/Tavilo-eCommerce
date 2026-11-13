import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ShopLayout from "./components/Layout";
import { Skeleton } from "./components/ui";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/apiClient";
import { useGuestSync } from "./hooks/useGuestSync";

// Remove the legacy client-side refresh token from older releases.
if (typeof window !== "undefined") {
  window.localStorage.removeItem("marketplace_refresh_token");
}

let authBootstrapPromise;

function bootstrapAuth() {
  authBootstrapPromise ||= api.post("/auth/refresh_token");
  return authBootstrapPromise;
}

const Home = lazy(() => import("./pages/Home"));
const ProductListing = lazy(() => import("./pages/ProductListing"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const VendorStore = lazy(() => import("./pages/VendorStore"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Account = lazy(() => import("./pages/Account"));
const Addresses = lazy(() => import("./pages/Addresses"));
const OrdersModule = lazy(() =>
  import("./pages/Orders").then((m) => ({ default: m.default || m.Orders })),
);
const OrderDetail = lazy(() =>
  import("./pages/Orders").then((m) => ({ default: m.OrderDetail })),
);
const Login = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.Login })),
);
const Signup = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.Signup })),
);
const VerifyEmail = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.VerifyEmail })),
);
const CheckEmail = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.CheckEmail })),
);
const ForgotPassword = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.ResetPassword })),
);
const VendorPortal = lazy(() => import("./pages/VendorPortal"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));

function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8" aria-busy="true" aria-label="Loading page">
      <div className="mb-6 h-7 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line bg-white p-2.5">
            <div className="aspect-[1.05] w-full animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestIndicator() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleRequestState = (event) => {
      setActive(Boolean(event.detail?.active));
    };
    window.addEventListener("tavilo:request-state", handleRequestState);
    return () =>
      window.removeEventListener("tavilo:request-state", handleRequestState);
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-brand-100 transition-opacity duration-150 ${
        active ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="polite"
      aria-label="Processing request"
    >
      <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] rounded-r-full bg-brand-600" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = useAuthStore((state) => state.accessToken);
  const isReady = useAuthStore((state) => state.isReady);
  const location = useLocation();
  if (!isReady) return <Loading />;
  return token ? (
    children
  ) : (
    <Navigate
      to={`/account?next=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );
}
function RoleRoute({ role, children }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user || user.role !== role)
    return (
      <Navigate
        to={`/account?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  return children;
}

/**
 * AppInner is the application shell. It is rendered inside the router so hooks
 * that need routing context (like useGuestSync) work correctly.
 */
function AppInner() {
  const setSession = useAuthStore((state) => state.setSession);
  const setReady = useAuthStore((state) => state.setReady);

  // Guest sync hook — handles merge after session bootstrap and login.
  useGuestSync();

  useEffect(() => {
    bootstrapAuth()
      .then(({ data }) => setSession({ access_token: data.access_token, user: data.user }))
      .catch(() => setReady());
  }, [setReady, setSession]);

  return (
    <>
      <RequestIndicator />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<ShopLayout />}>
            {/* ── Public routes ─────────────────────────────────────────── */}
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<ProductListing />} />
            <Route path="/c/:category" element={<ProductListing />} />
            <Route path="/search" element={<ProductListing />} />
            <Route path="/p/:slug" element={<ProductDetail />} />
            <Route path="/store/:slug" element={<VendorStore />} />
            {/* Cart and Wishlist are public — guests use localStorage */}
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<Wishlist />} />
            {/* ── Authenticated routes ───────────────────────────────────── */}
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/addresses"
              element={
                <ProtectedRoute>
                  <Addresses />
                </ProtectedRoute>
              }
            />
            <Route path="/account" element={<Account />} />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <OrdersModule />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id/success"
              element={
                <ProtectedRoute>
                  <OrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute>
                  <OrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor/*"
              element={
                <ProtectedRoute>
                  <VendorPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute>
                  <RoleRoute role="admin">
                    <AdminPortal />
                  </RoleRoute>
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return <AppInner />;
}
