import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ShopLayout from "./components/Layout";
import { Skeleton } from "./components/ui";
import { useAuthStore } from "./store/authStore";
import { api } from "./lib/apiClient";

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
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-6 h-72 w-full" />
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
export default function App() {
  const setSession = useAuthStore((state) => state.setSession);
  const setReady = useAuthStore((state) => state.setReady);

  useEffect(() => {
    bootstrapAuth()
      .then(({ data }) => setSession({ access_token: data.access_token, user: data.user }))
      .catch(() => setReady());
  }, [setReady, setSession]);

  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<ShopLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<ProductListing />} />
            <Route path="/c/:category" element={<ProductListing />} />
            <Route path="/search" element={<ProductListing />} />
            <Route path="/p/:slug" element={<ProductDetail />} />
            <Route path="/store/:slug" element={<VendorStore />} />
            <Route
              path="/cart"
              element={
                <ProtectedRoute>
                  <Cart />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wishlist"
              element={
                <ProtectedRoute>
                  <Wishlist />
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
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/resetpassword/:token" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
