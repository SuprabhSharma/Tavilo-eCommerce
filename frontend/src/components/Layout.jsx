import { useEffect, useRef, useState } from "react";
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
  ShoppingCart,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { brand } from "../config/brand";
import { useAuthStore } from "../store/authStore";
import { useGuestStore } from "../store/guestStore";
import { api } from "../lib/apiClient";
import { getCart, getWishlist } from "../api/shop";
import { ProductActionStateProvider } from "./ProductActionState";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/products", label: "Shop", icon: ShoppingBag },
  { to: "/stores", label: "Stores", icon: Store },
  { to: "/wishlist", label: "Wishlist", icon: Heart },
  { to: "/cart", label: "Cart", icon: ShoppingCart },
  { to: "/account", label: "Account", icon: UserRound },
];
// Keep the fixed mobile bar to five primary actions; Stores stays reachable
// through the prominent home CTA and the mobile menu.
const mobileNav = nav.filter(({ to }) => to !== "/stores");

const pageMeta = {
  "/": {
    title: "Tavilo | Good finds. Trusted stores.",
    description:
      "Discover quality products from trusted independent stores on Tavilo.",
  },
  "/products": {
    title: "Shop products | Tavilo",
    description:
      "Browse quality products from trusted independent stores on Tavilo.",
  },
  "/stores": {
    title: "Stores on Tavilo | Tavilo",
    description: "Browse trusted independent stores available on Tavilo.",
  },
  "/search": {
    title: "Search products | Tavilo",
    description:
      "Search products from trusted independent stores on Tavilo.",
  },
  "/account": {
    title: "Your account | Tavilo",
    description: "Manage your Tavilo account, orders, addresses and saved items.",
  },
  "/cart": {
    title: "Shopping cart | Tavilo",
    description: "Review your selected products before checkout on Tavilo.",
  },
};

function updatePageMeta(pathname) {
  const meta = pageMeta[pathname] || {
    title: "Tavilo | Good finds. Trusted stores.",
    description:
      "Discover quality products from trusted independent stores on Tavilo.",
  };
  document.title = meta.title;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", meta.description);
}

export default function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isCheckoutPage = location.pathname.startsWith("/checkout");
  const urlQuery = location.pathname === "/search"
    ? new URLSearchParams(location.search).get("q") || ""
    : "";
  const [query, setQuery] = useState(urlQuery);
  const MIN_SEARCH_LENGTH = 2;
  const debounceTimerRef = useRef(null);
  const lastNavigatedQueryRef = useRef(urlQuery);
  const inputRef = useRef(null);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = Boolean(accessToken && user);
  const { data: authCartCount = 0 } = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: isAuthenticated,
    // Header/navigation badges represent distinct products, not units. Line
    // quantities remain visible only in cart and checkout where they can be
    // acted on.
    select: (data) => data?.items?.length || 0,
  });
  const { data: authWishlistCount = 0 } = useQuery({
    queryKey: ["wishlist"],
    queryFn: getWishlist,
    enabled: isAuthenticated,
    select: (data) => data?.total ?? data?.items?.length ?? 0,
  });
  const queryClient = useQueryClient();
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    updatePageMeta(location.pathname);
  }, [location.pathname]);

  // Only URL navigation, not keystrokes, may replace the controlled input.
  // Depending on `query` here cleared text immediately on Home/detail/cart.
  useEffect(() => {
    const isSearch = location.pathname === "/search";
    const nextQuery = isSearch
      ? new URLSearchParams(location.search).get("q") || ""
      : "";

    if (isSearch) {
      lastNavigatedQueryRef.current = nextQuery;
      setQuery(nextQuery);
    } else if (location.pathname !== "/products") {
      lastNavigatedQueryRef.current = "";
      setQuery("");
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleQueryChange = (e) => {
    const nextVal = e.target.value;
    setQuery(nextVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = nextVal.trim().replace(/\s+/g, " ");
    const isSearchRoute = location.pathname === "/search";
    const isProductsRoute = location.pathname === "/products";

    if (isSearchRoute || isProductsRoute) {
      if (!trimmed) {
        // User manually cleared the search (backspaced all or cut/deleted)
        // Promptly replace URL to /products so refreshing keeps all products without reverting
        debounceTimerRef.current = setTimeout(() => {
          lastNavigatedQueryRef.current = "";
          navigate("/products", { replace: true });
        }, 150);
      } else {
        // User typed or partially deleted (e.g. from "youtube" to "yout")
        // Debounce update URL to ?q=... with replace: true so browser history isn't polluted
        debounceTimerRef.current = setTimeout(() => {
          lastNavigatedQueryRef.current = trimmed;
          navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
        }, 350);
      }
    } else {
      // User is on a non-search page (e.g. Home, Product Detail, Cart).
      // Debounce typing to navigate to /search?q=... (push navigation so Back returns to original page)
      if (trimmed) {
        debounceTimerRef.current = setTimeout(() => {
          lastNavigatedQueryRef.current = trimmed;
          navigate(`/search?q=${encodeURIComponent(trimmed)}`);
        }, 350);
      }
    }
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setQuery("");
    lastNavigatedQueryRef.current = "";
    if (location.pathname === "/search" || location.pathname === "/products") {
      navigate("/products", { replace: true });
    }
    inputRef.current?.focus();
  };

  const submitSearch = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const trimmed = (query || "").trim().replace(/\s+/g, " ");
    if (trimmed) {
      lastNavigatedQueryRef.current = trimmed;
      if (location.pathname === "/search") {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
      } else {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    } else {
      lastNavigatedQueryRef.current = "";
      navigate("/products", { replace: true });
    }
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
  const guestCount = useGuestStore((state) =>
    state.cart.items.length,
  );
  const count = isAuthenticated ? authCartCount : guestCount;
  const guestWishlistCount = useGuestStore((state) => state.wishlist.items.length);
  const wishlistCount = isAuthenticated ? authWishlistCount : guestWishlistCount;
  return (
    <div className={`min-h-screen bg-[#f4f8fb] text-ink ${isCheckoutPage ? "pb-0" : "pb-20 md:pb-0"}`}>
      {!isCheckoutPage && (
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),inset_0_-1px_0_rgba(255,255,255,0.8)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200/80 bg-white shadow-tactile text-ink hover:bg-slate-50 md:hidden active:scale-95 transition"
          >
            <Menu size={20} />
          </button>
          <Link to="/" className="flex w-24 shrink-0 items-center sm:w-32">
            <img
              src={brand.logo}
              alt={brand.logoAlt}
              className="h-auto w-full object-contain"
              decoding="async"
            />
          </Link>
          <form
            action="#"
            onSubmit={submitSearch}
            className="flex min-w-0 flex-1 items-center rounded-xl bg-slate-100/90 border border-slate-300/80 px-3 shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus-within:bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 focus-within:shadow-[0_2px_10px_rgba(11,181,176,0.12)] transition-all"
          >
            <Search size={16} className="shrink-0 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              aria-label="Search products"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  submitSearch(e);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleClear();
                }
              }}
              placeholder="Search products, brands and categories"
              enterKeyHint="search"
              minLength={MIN_SEARCH_LENGTH}
              autoComplete="off"
              spellCheck="false"
              className="h-10 w-full min-w-0 bg-transparent px-2.5 text-xs sm:text-sm font-medium text-ink outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={handleClear}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-ink transition-colors"
              >
                <X size={14} />
              </button>
            )}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
              Search
            </button>
          </form>

          {/* Desktop-only Auth (Account / Sign In / Log Out) */}
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/account"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-sm font-bold shadow-tactile hover:bg-slate-50 transition active:scale-95"
                >
                  <UserRound size={17} className="text-brand-600" />
                  <span>Hi, {user.first_name || user.email?.split("@")[0]}</span>
                </NavLink>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-100 transition-colors active:scale-95"
                >
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="btn-3d-primary rounded-xl px-4 py-2 text-sm font-extrabold text-white shadow-md active:scale-95"
              >
                Sign in
              </Link>
            )}
          </div>

          {/* Desktop-only Wishlist & Cart icons: On mobile, these are already in the bottom navigation bar */}
          <div className="hidden items-center gap-1.5 sm:gap-2 md:flex">
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white shadow-tactile text-ink hover:bg-slate-50 active:scale-95 transition"
            >
              <Heart size={20} className={wishlistCount > 0 ? "text-brand-600 fill-brand-600" : "text-ink"} />
              {wishlistCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-extrabold text-white ring-2 ring-white shadow-sm">
                  {wishlistCount}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white shadow-tactile text-ink hover:bg-slate-50 active:scale-95 transition"
            >
              <ShoppingCart size={20} />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-extrabold text-white ring-2 ring-white shadow-sm">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>
        <div className="hidden border-t border-slate-200/80 bg-white/60 backdrop-blur-sm md:block">
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-6 px-4 text-sm font-semibold text-slate-600 sm:px-6 lg:px-8">
            <Link to="/products" className="hover:text-brand-600 transition-colors">
              All products
            </Link>
            <Link to="/products?sort=rating" className="hover:text-brand-600 transition-colors">
              Top rated
            </Link>
            <Link to="/products?sort=newest" className="hover:text-brand-600 transition-colors">
              New arrivals
            </Link>
            <Link to="/stores" className="hover:text-brand-600 transition-colors">
              Stores
            </Link>
          </div>
        </div>
      </header>
      )}
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
                    {to === "/wishlist" && wishlistCount > 0 && (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                        {wishlistCount}
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
      <main className="min-w-0 overflow-x-clip">
        <ProductActionStateProvider>
          <Outlet />
        </ProductActionStateProvider>
      </main>
      {!isCheckoutPage && (
        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-center text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left lg:px-8">
            <p>
              <span className="font-semibold text-ink">Tavilo</span> &mdash;{" "}
              {brand.tagline}
            </p>
            <p>
              Copyright &copy; {new Date().getFullYear()} Suprabh Sharma.{" "}
              <a
                href="tel:+919756455554"
                className="font-medium text-brand-700 hover:text-brand-600"
              >
                Contact: 9756455554
              </a>
            </p>
          </div>
        </footer>
      )}
      {!isCheckoutPage && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4.25rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-slate-200/90 bg-white/95 backdrop-blur-lg px-2 pt-2 shadow-[0_-8px_24px_-4px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] md:hidden">
          {mobileNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] transition-all active:scale-95 ${
                  isActive
                    ? "font-extrabold text-brand-700 bg-brand-50 shadow-[0_1px_3px_rgba(11,181,176,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]"
                    : "font-semibold text-slate-500 hover:text-ink"
                }`
              }
            >
              <Icon size={20} strokeWidth={2.2} />
              <span>{label}</span>
              {to === "/cart" && count > 0 && (
                <span className="absolute right-1 top-0 grid h-4 min-w-4 items-center rounded-full bg-brand-600 px-1 text-[9px] font-extrabold text-white ring-2 ring-white shadow-sm">
                  {count}
                </span>
              )}
              {to === "/wishlist" && wishlistCount > 0 && (
                <span className="absolute right-1 top-0 grid h-4 min-w-4 items-center rounded-full bg-brand-600 px-1 text-[9px] font-extrabold text-white ring-2 ring-white shadow-sm">
                  {wishlistCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
