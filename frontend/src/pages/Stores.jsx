import { useEffect, useMemo, useState } from "react";
import { Search, Store, X } from "lucide-react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listVendors } from "../api/catalog";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";

const MIN_SEARCH_LENGTH = 2;

export default function Stores() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim().replace(/\s+/g, " ")),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const searchTooShort = debouncedSearch.length > 0 && debouncedSearch.length < MIN_SEARCH_LENGTH;
  const vendors = useInfiniteQuery({
    queryKey: ["vendors", debouncedSearch],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => listVendors({ q: debouncedSearch, cursor: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_cursor : undefined,
    enabled: !searchTooShort,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
  const stores = useMemo(
    () => vendors.data?.pages.flatMap((page) => page.items) ?? [],
    [vendors.data],
  );

  const submitSearch = (event) => {
    event.preventDefault();
    setDebouncedSearch(search.trim().replace(/\s+/g, " "));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Tavilo marketplace</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Shop by store</h1>
        <p className="mt-2 text-sm text-muted">Choose a store to browse only its products and services.</p>
      </div>

      <form className="relative mt-6 block max-w-xl" onSubmit={submitSearch} role="search">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("");
          }}
          placeholder="Search stores, e.g. Patanjali"
          aria-label="Search stores"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck="false"
          className="h-12 w-full rounded-xl border border-line bg-white py-2 pl-11 pr-11 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15"
        />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear store search" className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-ink"><X size={16} /></button>}
      </form>

      {searchTooShort ? (
        <div className="mt-8"><EmptyState title="Keep typing to search" description="Enter at least two characters to search stores." /></div>
      ) : vendors.isError && stores.length === 0 ? (
        <div className="mt-8"><ErrorState onRetry={vendors.refetch} /></div>
      ) : vendors.isPending ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44" />)}</div>
      ) : !stores.length ? (
        <div className="mt-8"><EmptyState title={debouncedSearch ? "No matching stores" : "No stores available yet"} description={debouncedSearch ? "Try a different store name or browse all stores." : "Please check back soon for new Tavilo stores."} /></div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={vendors.isFetching && !vendors.isFetchingNextPage}>
            {stores.map((vendor) => (
              <Link key={vendor.uid} to={`/store/${vendor.slug}`} className="directory-card card-3d group flex min-h-44 flex-col rounded-2card p-5 focus:outline-none focus:ring-4 focus:ring-brand-500/20">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">{vendor.logo_url ? <img src={vendor.logo_url} alt="" className="h-full w-full rounded-2xl object-cover" /> : <Store size={22} />}</div>
                <h2 className="mt-4 text-base font-bold text-ink group-hover:text-brand-600">{vendor.store_name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{vendor.description || "Browse this store's collection on Tavilo."}</p>
                <span className="mt-auto pt-4 text-sm font-semibold text-brand-600">Visit store &rarr;</span>
              </Link>
            ))}
          </div>
          {vendors.hasNextPage && <div className="mt-8 flex justify-center"><button type="button" className="min-h-11 rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink shadow-sm transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={vendors.isFetchingNextPage} onClick={() => vendors.fetchNextPage()}>{vendors.isFetchingNextPage ? "Loading stores…" : "Load more stores"}</button></div>}
        </>
      )}
    </div>
  );
}