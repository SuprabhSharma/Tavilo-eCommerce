import { lazy, Suspense, useEffect, useCallback, useTransition } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ShopLayout from "./components/Layout";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/apiClient";
import { useGuestSync } from "./hooks/useGuestSync";

// Remove any legacy client-side refresh token from older releases.
if (typeof window !== "undefined") {
  window.localStorage.removeItem("marketplace_refresh_token");
}

// Bootstrap auth exactly once — module-level singleton promise.
let authBootstrapPromise;
function bootstrapAuth() {
  authBootstrapPromise ??= api.post("/auth/refresh_token");
  return authBootstrapPromise;
}

// ── Page-level code-split chunks ────────────────────────────────────────────
// Each lazy() maps to its own bundle chunk. Keep all portal/admin pages in
// separate chunks so they are only fetched when users navigate to them.
const Home           = lazy(() => import("./pages/Home"));
const ProductListing = lazy(() => import("./pages/ProductListing"));
const ProductDetail  = lazy(() => import("./pages/ProductDetail"));
const VendorStore    = lazy(() => import("./pages/VendorStore"));
const Cart           = lazy(() => import("./pages/Cart"));
const Checkout       = lazy(() => import("./pages/Checkout"));
const Wishlist       = lazy(() => import("./pages/Wishlist"));
const Account        = lazy(() => import("./pages/Account"));
const Addresses      = lazy(() => import("./pages/Addresses"));
const OrdersModule   = lazy(() =>
  import("./pages/Orders").then((m) => ({ default: m.default || m.Orders })),
);
const OrderDetail    = lazy(() =>
  import("./pages/Orders").then((m) => ({ default: m.OrderDetail })),
);
// Auth pages are very rarely visited from the main flow — keep them together.
const Login          = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Login })));
const Signup         = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Signup })));
const VerifyEmail    = lazy(() => import("./pages/Auth").then((m) => ({ default: m.VerifyEmail })));
const CheckEmail     = lazy(() => import("./pages/Auth").then((m) => ({ default: m.CheckEmail })));
const ForgotPassword = lazy(() => import("./pages/Auth").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword  = lazy(() => import("./pages/Auth").then((m) => ({ default: m.ResetPassword })));
// Portals are only needed for logged-in vendor / admin users.
const VendorPortal   = lazy(() => import("./pages/VendorPortal"));
const AdminPortal    = lazy(() => import("./pages/AdminPortal"));

// ── Loading skeleton ─────────────────────────────────────────────────────────
// Rendered by <Suspense> while a page chunk is being fetched.
// Using static arrays avoids recreating them on every render.
const SKELETON_ITEMS = Array.from({ length: 8 }, (_, i) => i);

function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8" aria-busy="true" aria-label="Loading page">
      <div className="mb-6 h-7 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SKELETON_ITEMS.map((i) => (
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

// ── Top-loading bar ───────────────────────────────────────────────────────────
// Listens for the rAF-scheduled custom event from apiClient.js.
// Pure DOM — zero React re-renders during requests.
function RequestIndicator() {
  useEffect(() => {
    const bar = document.getElementById("tavilo-request-bar");
    if (!bar) return undefined;

    const handler = (event) => {
      bar.style.opacity = event.detail?.active ? "1" : "0";
    };
    window.addEventListener("tavilo:request-state", handler, { passive: true });
    return () => window.removeEventListener("tavilo:request-state", handler);
  }, []);

  // The bar itself is rendered as a plain div that we control via direct
  // DOM style mutation — no setState, no re-render, no React reconciliation.
  return (
    <div
      id="tavilo-request-bar"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-brand-100"
      style={{ opacity: 0, transition: "opacity 150ms" }}
      role="status"
      aria-live="polite"
      aria-label="Processing request"
    >
      <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] rounded-r-full bg-brand-600" />
    </div>
  );
}

// ── Route guards ──────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const token   = useAuthStore((s) => s.accessToken);
  const isReady = useAuthStore((s) => s.isReady);
  const location = useLocation();

  if (!isReady) return <Loading />;
  return token ? (
    children
  ) : (
    <Navigate to={`/account?next=${encodeURIComponent(location.pathname)}`} replace />
  );
}

function RoleRoute({ role, children }) {
  const user     = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user || user.role !== role) {
    return (
      <Navigate to={`/account?next=${encodeURIComponent(location.pathname)}`} replace />
    );
  }
  return children;
}

// ── App shell ─────────────────────────────────────────────────────────────────
// AppInner lives inside the Router so hooks that need routing context work.
function AppInner() {
  const setSession = useAuthStore((s) => s.setSession);
  const setReady   = useAuthStore((s) => s.setReady);

  // Sync guest cart / wishlist to server on login / session restore.
  useGuestSync();

  // Wrap the auth bootstrap in useTransition so React marks the subsequent
  // state update as non-urgent. This prevents the synchronous token-refresh
  // response from blocking a paint and triggering long-task violations.
  const [, startTransition] = useTransition();

  const handleBootstrap = useCallback(() => {
    bootstrapAuth()
      .then(({ data }) => {
        startTransition(() => {
          if (data?.access_token) {
            setSession({ access_token: data.access_token, user: data.user });
          } else {
            setReady();
          }
        });
      })
      .catch(() => startTransition(() => setReady()));
  }, [setSession, setReady, startTransition]);

  useEffect(() => {
    handleBootstrap();
  }, [handleBootstrap]);

  return (
    <>
      <RequestIndicator />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<ShopLayout />}>
            {/* ── Public ───────────────────────────────────────────────── */}
            <Route path="/"               element={<Home />} />
            <Route path="/products"       element={<ProductListing />} />
            <Route path="/c/:category"    element={<ProductListing />} />
            <Route path="/search"         element={<ProductListing />} />
            <Route path="/p/:slug"        element={<ProductDetail />} />
            <Route path="/store/:slug"    element={<VendorStore />} />
            <Route path="/cart"           element={<Cart />} />
            <Route path="/wishlist"       element={<Wishlist />} />

            {/* ── Protected ────────────────────────────────────────────── */}
            <Route path="/checkout"       element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="/addresses"      element={<ProtectedRoute><Addresses /></ProtectedRoute>} />
            <Route path="/account"        element={<Account />} />
            <Route path="/orders"         element={<ProtectedRoute><OrdersModule /></ProtectedRoute>} />
            <Route path="/orders/:id/success" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/orders/:id"     element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/vendor/*"       element={<ProtectedRoute><VendorPortal /></ProtectedRoute>} />
            <Route path="/admin/*"        element={
              <ProtectedRoute>
                <RoleRoute role="admin"><AdminPortal /></RoleRoute>
              </ProtectedRoute>
            } />
          </Route>

          {/* ── Auth pages (no layout chrome) ───────────────────────── */}
          <Route path="/login"            element={<Login />} />
          <Route path="/signup"           element={<Signup />} />
          <Route path="/check-email"      element={<CheckEmail />} />
          <Route path="/verify-email"     element={<VerifyEmail />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />

          {/* ── Catch-all ─────────────────────────────────────────────── */}
          <Route path="*"                 element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return <AppInner />;
}
