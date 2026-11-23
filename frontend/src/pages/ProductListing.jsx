import { useEffect, useMemo, useRef } from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
  const q = rawQ.trim().replace(/\s+/g, " ");
  const searchTooShort = isSearchPage && q.length > 0 && q.length < 2;
  const sort = params.get("sort") || "newest";
  const inStock = params.get("in_stock") === "true";
  const loadMoreRef = useRef(null);

  const queryParams = useMemo(
    () => ({
      page_size: 20,
      category: category || undefined,
      q: q || undefined,
      sort,
      in_stock: inStock || undefined,
      // Cursor pages fetch one extra row instead of executing COUNT(*).
      include_total: false,
    }),
    [category, q, sort, inStock],
  );

  const products = useInfiniteQuery({
    queryKey: ["products", queryParams],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => listProducts(
      { ...queryParams, cursor: pageParam || undefined },
      signal,
    ),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_cursor : undefined,
    enabled: !searchTooShort,
  });
  const productItems = useMemo(
    () => products.data?.pages.flatMap((page) => page.items) ?? [],
    [products.data],
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = products;

  // Fetch before the user reaches the visual end of the grid. Intersection
  // Observer runs off the scroll hot path, unlike scroll event handlers.
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchingNextPage) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, productItems.length]);

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
    enabled: Boolean(products.data && productItems.length === 0),
    staleTime: 5 * 60 * 1000,
  });

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Filter changes reset the local keyset cursor through the effect above.
    next.delete("page");

    // /c/:category encodes a category outside the query string. Leaving that
    // route after selecting "All categories" would otherwise reapply the
    // route category via the `pathCategory` fallback on the next render.
    if (key === "category" && !value && pathCategory) {
      const search = next.toString();
      navigate(search ? `/products?${search}` : "/products");
      return;
    }
    setParams(next);
  };

  const handleClearSearch = () => {
    navigate("/products", { replace: true });
  };

  const handleClearFilters = () => {
    if (isSearchPage || pathCategory) {
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
      {searchTooShort ? (
        <div className="card-3d rounded-2card p-8 text-center sm:p-14 shadow-float" role="status">
          <h2 className="text-xl font-extrabold text-ink">Keep typing to search</h2>
          <p className="mt-2 text-sm text-muted">Enter at least two characters to search products.</p>
        </div>
      ) : products.isPending ? (
        <ProductGridSkeleton />
      ) : products.isError && productItems.length === 0 ? (
        <ErrorState onRetry={products.refetch} />
      ) : productItems.length === 0 ? (
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
            Browse products
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {productItems.map((product, idx) => (
              <ProductCard
                key={product.uid}
                product={product}
                priority={idx < 4}
              />
            ))}
          </div>
          <div ref={loadMoreRef} className="mt-8 flex min-h-11 items-center justify-center" aria-live="polite">
            {isFetchingNextPage ? (
              <span className="text-sm text-muted">Loading more products…</span>
            ) : hasNextPage ? (
              <Button variant="outline" onClick={() => fetchNextPage()}>
                Load more products
              </Button>
            ) : (
              <span className="text-sm text-muted">You’ve reached the end</span>
            )}
          </div>
          {products.isError && productItems.length > 0 && (
            <div className="mt-3 text-center"><Button variant="outline" onClick={() => fetchNextPage()}>Retry loading more</Button></div>
          )}
        </>
      )}
    </div>
  );
}
