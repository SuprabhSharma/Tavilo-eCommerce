import { useEffect, useMemo, useState } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { listCategories, listProducts } from "../api/catalog";
import ProductCard from "../components/ProductCard";
import { PageHeader, ProductGridSkeleton } from "../components/Page";
import { Button, ErrorState, Select } from "../components/ui";

export default function ProductListing() {
  const { category: pathCategory } = useParams();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || pathCategory || "";
  const q = params.get("q") || "";
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
    placeholderData: (previous) => previous,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Filter changes reset the local keyset cursor through the effect above.
    next.delete("page");
    setParams(next);
  };
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
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-card border border-line bg-white p-3">
        <div className="mr-auto flex items-center gap-2 text-sm font-semibold">
          <Filter size={17} className="text-brand-600" /> Filters
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => update("category", e.target.value)}
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
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
        <div className="rounded-card border border-dashed border-line bg-white p-16 text-center">
          <p className="font-semibold">No products match these filters.</p>
          <button
            className="mt-3 text-sm font-semibold text-brand-600"
            onClick={() => setParams({})}
          >
            Clear filters
          </button>
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
