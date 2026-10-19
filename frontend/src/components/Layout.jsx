import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Heart,
  Home,
  LogOut,
  Menu,
  Search,
  ShoppingBag,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { brand } from "../config/brand";
import { useAuthStore } from "../store/authStore";
import { api } from "../lib/apiClient";
import { getCart } from "../api/shop";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/products", label: "Shop", icon: Store },
  { to: "/wishlist", label: "Wishlist", icon: Heart },
  { to: "/cart", label: "Cart", icon: ShoppingBag },
  { to: "/account", label: "Account", icon: UserRound },
];
export default function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = Boolean(accessToken && user);
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: isAuthenticated,
  });
  const queryClient = useQueryClient();
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  const submitSearch = (event) => {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };
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
  const count = isAuthenticated
    ? cart.data?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0
    : 0;
  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-ink md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-lg text-ink hover:bg-slate-100 md:hidden"
          >
            <Menu size={21} />
          </button>
          <Link to="/" className="flex w-28 shrink-0 items-center sm:w-32">
            <img
              src={brand.logo}
              alt={brand.logoAlt}
              className="h-auto w-full object-contain"
              decoding="async"
            />
          </Link>
          <form
            onSubmit={submitSearch}
            className="ml-auto flex max-w-xl flex-1 items-center rounded-lg bg-slate-100 px-3 focus-within:ring-2 focus-within:ring-brand-100"
          >
            <Search size={18} className="shrink-0 text-muted" />
            <input
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for products, brands and more"
              className="h-11 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted"
            />
          </form>
          <nav className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/account"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
                >
                  <UserRound size={17} className="text-brand-600" />
                  <span>Hi, {user.first_name || user.email?.split("@")[0]}</span>
                </NavLink>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
              >
                Sign in
              </Link>
            )}
            <Link
              to="/cart"
              className="relative grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-100"
            >
              <ShoppingBag size={20} />
              {count > 0 && (
                <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          </nav>
        </div>
        <div className="hidden border-t border-line md:block">
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-6 px-4 text-sm text-muted sm:px-6 lg:px-8">
            <Link to="/products" className="font-medium hover:text-brand-600">
              All products
            </Link>
            <Link to="/products?sort=rating" className="hover:text-brand-600">
              Top rated
            </Link>
            <Link to="/products?sort=newest" className="hover:text-brand-600">
              New arrivals
            </Link>
          </div>
        </div>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-80 max-w-[85vw] flex-col justify-between overflow-y-auto bg-white p-5 shadow-float">
            <div>
              <div className="flex items-center justify-between">
                <Link
                  to="/"
                  className="flex w-32 items-center"
                  onClick={() => setMenuOpen(false)}
                >
                  <img
                    src={brand.logo}
                    alt={brand.logoAlt}
                    className="h-auto w-full object-contain"
                    decoding="async"
                  />
                </Link>
                <button
                  aria-label="Close"
                  onClick={() => setMenuOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Profile or Welcome banner (Flipkart style) */}
              <div className="mt-6 rounded-xl border border-line bg-slate-50 p-4">
                {isAuthenticated ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm">
                      {(user.first_name?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {user.first_name
                          ? `${user.first_name} ${user.last_name || ""}`.trim()
                          : user.email?.split("@")[0]}
                      </p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                      <span className="mt-1 inline-block rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                        {user.role || "Customer"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-muted">
                        <UserRound size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">Welcome to Tavilo</p>
                        <p className="text-xs text-muted">Sign in for the best experience</p>
                      </div>
                    </div>
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className="mt-3 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
                    >
                      Sign in / Register
                    </Link>
                  </div>
                )}
              </div>

              {/* Navigation links - clean, uniform list */}
              <div className="mt-6 space-y-1">
                {nav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-50 font-semibold text-brand-600"
                          : "text-ink hover:bg-slate-100"
                      }`
                    }
                  >
                    <Icon size={18} />
                    <span>{to === "/account" && !isAuthenticated ? "Account" : label}</span>
                    {to === "/cart" && count > 0 && (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                        {count}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Bottom action: ONLY when logged in, show ONE Log out button. No duplicate login buttons when logged out */}
            <div className="mt-6 border-t border-line pt-4">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="flex w-full min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={18} />
                  <span>Log out</span>
                </button>
              ) : (
                <p className="text-center text-xs text-muted">
                  Tavilo Marketplace &bull; 100% Secure
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-line bg-white px-2 pt-2 md:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex min-w-14 flex-col items-center gap-1 text-[11px] ${isActive ? "font-semibold text-brand-600" : "text-muted"}`
            }
          >
            <Icon size={19} />
            <span>{label}</span>
            {to === "/cart" && count > 0 && (
              <span className="absolute right-1 top-[-4px] grid h-4 min-w-4 items-center rounded-full bg-brand-600 px-1 text-[9px] text-white">
                {count}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
