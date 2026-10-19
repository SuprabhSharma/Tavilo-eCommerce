import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LogOut, MapPin, Package, Store, UserRound } from "lucide-react";
import { getMe } from "../api/auth";
import { getAddresses, getWishlist } from "../api/shop";
import { useAuthStore } from "../store/authStore";
import { Button, ErrorState, Skeleton } from "../components/ui";
import { getErrorMessage } from "../lib/errors";
import { api } from "../lib/apiClient";

export default function Account() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accessToken, user, setUser, logout } = useAuthStore();
  const isAuthenticated = Boolean(accessToken && user);
  const me = useQuery({
    queryKey: ["me", user?.uid],
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 0,
  });
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: getAddresses,
    enabled: isAuthenticated,
  });
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: getWishlist,
    enabled: isAuthenticated,
  });
  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  const signOut = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* session is cleared locally */
    }
    queryClient.clear();
    logout();
    navigate("/");
  };

  if (!isAuthenticated || (me.isError && me.error?.response?.status === 401)) {
    return <AuthPrompt next={search.get("next")} />;
  }
  if (me.isLoading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-24" />
        <Skeleton className="mt-5 h-40" />
      </div>
    );
  if (me.isError)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState onRetry={me.refetch} message={getErrorMessage(me.error)} />
      </div>
    );
  const display = me.data || user;
  const isAdmin = display.role === "admin";
  const isVendor = display.role === "vendor";
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-card bg-brand-700 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15">
              <UserRound />
            </span>
            <div>
              <p className="text-xl font-bold">
                {display.first_name} {display.last_name}
              </p>
              <p className="text-sm text-blue-100">{display.email}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-blue-200">
                {display.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25 self-start sm:self-center"
          >
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/orders"
          className="rounded-card border border-line bg-white p-5 hover:border-brand-100"
        >
          <Package className="text-brand-600" />
          <p className="mt-4 font-semibold">My orders</p>
          <p className="mt-1 text-sm text-muted">Track and manage orders</p>
        </Link>
        <Link
          to="/wishlist"
          className="rounded-card border border-line bg-white p-5 hover:border-brand-100"
        >
          <Heart className="text-brand-600" size={24} />
          <p className="mt-3 font-semibold">Wishlist</p>
          <p className="mt-1 text-sm text-muted">
            {wishlist.data?.total || 0} saved items
          </p>
        </Link>
        <div className="rounded-card border border-line bg-white p-5">
          <MapPin className="text-brand-600" />
          <p className="mt-4 font-semibold">Addresses</p>
          <p className="mt-1 text-sm text-muted">
            {addresses.data?.length || 0} saved addresses
          </p>
        </div>
        <Link
          to={isAdmin ? "/admin" : "/vendor"}
          className="rounded-card border border-brand-100 bg-brand-50 p-5 hover:border-brand-200"
        >
          <Store className="text-brand-600" />
          <p className="mt-4 font-semibold">
            {isAdmin
              ? "Admin console"
              : isVendor
                ? "Vendor centre"
                : "Sell on Tavilo"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? "Review Tavilo activity"
              : isVendor
                ? "Manage products and services"
                : "Apply to become a vendor"}
          </p>
        </Link>
      </div>
    </div>
  );
}

function AuthPrompt({ next }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600">
        <UserRound />
      </div>
      <h1 className="mt-5 text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in to see your account, orders and saved items.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button
          onClick={() =>
            navigate(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`)
          }
        >
          Sign in
        </Button>
        <Button variant="outline" onClick={() => navigate("/signup")}>
          Create account
        </Button>
      </div>
    </div>
  );
}
