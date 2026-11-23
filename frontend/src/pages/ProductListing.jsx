import { useEffect, useMemo, useState } from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listCategories, listProducts } from "../api/catalog";
import ProductCard from "../components/ProductCard";
import { PageHeader, ProductGridSkeleton } from "../components/Page";
import { Button, ErrorState, Select } from "../components/ui";

export default function ProductListing() {
  const { category: pathCategory } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isSearchPage = location.pathname.replace(/\/$/, "") === "/search";
  const category = params.get("category") || pathCategory || "";
  const rawQ = params.get("q") || "";
  const q = rawQ.trim();
  const sort = params.get("sort") || "newest";
  const inStock = params.get("in_stock") === "true";
  const [cursor, setCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);

  const queryParams = useMemo(
    () => ({
      page_size: 20,
      category: category || undefined,
      q: q || undefined,
      sort,
      in_stock: inStock || undefined,
      cursor: cursor || undefined,
      // Cursor pages fetch one extra row instead of executing COUNT(*).
      include_total: false,
    }),
    [cursor, category, q, sort, inStock],
  );

  useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
  }, [category, q, sort, inStock]);

  const products = useQuery({
    queryKey: ["products", queryParams],
    queryFn: () => listProducts(queryParams),
    placeholderData: (previous, previousQuery) => {
      const prevQ = previousQuery?.queryKey?.[1]?.q;
      const nextQ = queryParams.q;
      // Do not retain stale placeholder data when search query changes (e.g. from "youtube" to "yout")
      // This avoids false 0-results flash while loading the new query
      if (prevQ !== nextQ) {
        return undefined;
      }
      return previous;
    },
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  // Recommended products for 0-result empty search state (Flipkart-standard recovery shelf)
  const popularProducts = useQuery({
    queryKey: ["products", { page_size: 8, sort: "rating" }],
    queryFn: () => listProducts({ page_size: 8, sort: "rating" }),
    enabled: Boolean(products.data && products.data.items.length === 0),
    staleTime: 5 * 60 * 1000,
  });

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Filter changes reset the local keyset cursor through the effect above.
    next.delete("page");
    setParams(next);
  };

  const handleClearSearch = () => {
    navigate("/products", { replace: true });
  };

  const handleClearFilters = () => {
    if (isSearchPage) {
      navigate("/products", { replace: true });
    } else {
      setParams({});
    }
  };

  // If a user navigates to /search without a query or removes q, redirect cleanly to /products
  if (isSearchPage && !q) {
    return <Navigate to="/products" replace />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={q ? "Search results" : category ? "Category" : "Discover"}
        title={
          q
            ? `Results for “${q}”`
            : category
              ? categories.data?.find((item) => item.slug === category)?.name ||
                "Products"
              : "All products"
        }
        description="Browse products from stores you can feel good about."
      />
      <div className="mb-6 flex flex-wrap items-center gap-2.5 rounded-2card border border-slate-200/90 bg-white p-3.5 shadow-card">
        <div className="mr-auto flex items-center gap-2 text-sm font-extrabold text-ink">
          <Filter size={17} className="text-brand-600" /> Filters
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => update("category", e.target.value)}
          className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(15,23,42,0.05),inset_0_1px_0_#ffffff] outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15"
        >
          <option value="">All categories</option>
          {(categories.data || []).map((item) => (
            <option key={item.uid} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <Select
          label=""
          aria-label="Sort"
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="rating">Top rated</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </Select>
        <Button
          variant={inStock ? "soft" : "outline"}
          className="h-10 min-h-10"
          onClick={() => update("in_stock", inStock ? "" : "true")}
        >
          <SlidersHorizontal size={15} />
          In stock
        </Button>
      </div>
      {products.isLoading ? (
        <ProductGridSkeleton />
      ) : products.isError ? (
        <ErrorState onRetry={products.refetch} />
      ) : products.data.items.length === 0 ? (
        <div className="space-y-10">
          <div className="card-3d rounded-2card p-8 text-center sm:p-14 shadow-float">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-200/80 shadow-[0_2px_6px_rgba(11,181,176,0.2),inset_0_1px_0_rgba(255,255,255,0.9)]">
              <Search size={28} strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-extrabold text-ink sm:text-2xl tracking-tight">
              {q ? `No results found for “${q}”` : "No products match these filters"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-500 leading-relaxed">
              {q
                ? "Please check the spelling, try searching with different keywords, or explore our full collection."
                : "Try adjusting your filters or selecting a different category to find what you are looking for."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="primary"
                className="h-11 px-6 text-sm font-extrabold"
                onClick={handleClearSearch}
              >
                Browse all products
              </Button>
              {(category || inStock || sort !== "newest") && (
                <Button
                  variant="outline"
                  className="h-11 px-5 text-sm font-bold"
                  onClick={handleClearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </div>

          {popularProducts.data?.items?.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="text-base font-bold text-ink sm:text-lg">
                    Popular products you might like
                  </h3>
                  <p className="text-xs text-muted">Top rated picks from our stores</p>
                </div>
                <Link
                  to="/products"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 sm:text-sm"
                >
                  View all &rarr;
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {popularProducts.data.items.map((product) => (
                  <ProductCard key={product.uid} product={product} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-muted">
            {products.data.total == null ? "Browse more products" : `${products.data.total} products`}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.data.items.map((product, idx) => (
              <ProductCard
                key={product.uid}
                product={product}
                priority={idx < 4}
              />
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={cursorHistory.length === 0}
              onClick={() => {
                const nextHistory = cursorHistory.slice(0, -1);
                setCursorHistory(nextHistory);
                setCursor(nextHistory.at(-1) || null);
              }}
            >
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {cursorHistory.length + 1}
            </span>
            <Button
              variant="outline"
              disabled={!products.data.has_more || products.isFetching}
              onClick={() => {
                setCursorHistory([...cursorHistory, products.data.next_cursor]);
                setCursor(products.data.next_cursor);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
