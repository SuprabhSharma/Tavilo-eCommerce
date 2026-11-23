import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listCategories, listProducts } from "../api/catalog";
import ProductCard from "../components/ProductCard";
import { ProductGridSkeleton, SectionTitle } from "../components/Page";
import { ErrorState } from "../components/ui";
import { brand } from "../config/brand";

export default function Home() {
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: 24 * 60 * 60 * 1000, // categories change rarely
    gcTime: 24 * 60 * 60 * 1000,
  });
  const allProducts = useQuery({
    queryKey: ["products", { page: 1, page_size: 8 }],
    queryFn: () => listProducts({ page: 1, page_size: 8 }),
  });
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#066f6a] via-[#088b86] to-[#044e4b] text-white shadow-lg">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-emerald-400/15 blur-2xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:py-20 lg:px-8">
          <div>
            <p className="mb-3 text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] text-teal-100">
              {brand.tagline}
            </p>
            <h1 className="max-w-xl text-3xl font-extrabold tracking-tight sm:text-5xl drop-shadow-sm">
              A better way to find what fits your life.
            </h1>
            <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-teal-50/90 font-medium">
              Explore thoughtful products from independent stores, with clear
              prices and a checkout that stays simple.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="btn-3d-white inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-extrabold text-ink shadow-lg active:scale-95"
              >
                Start exploring <ArrowRight size={17} />
              </Link>
              <Link
                to="/products?sort=rating"
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-white/10 backdrop-blur-md px-6 text-sm font-bold text-white shadow-tactile hover:bg-white/20 active:scale-95 transition"
              >
                Top rated
              </Link>
              <Link
                to="/stores"
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-white/10 backdrop-blur-md px-6 text-sm font-bold text-white shadow-tactile hover:bg-white/20 active:scale-95 transition"
              >
                Shop by store
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative mx-auto max-w-sm rounded-[2rem] bg-white/10 p-4 shadow-2xl backdrop-blur-md border border-white/20">
              <div className="rounded-[1.5rem] bg-white p-6 text-ink shadow-float border border-slate-100">
                <p className="text-xs font-extrabold uppercase tracking-widest text-brand-600">
                  Curated today
                </p>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-ink">
                  Small stores.
                  <br />
                  Big personality.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-800 font-extrabold shadow-sm">
                    ✦
                  </span>
                  <p className="text-sm font-semibold text-slate-600">
                    Good products are closer than you think.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="card-3d flex items-center gap-3.5 rounded-2card p-4 sm:p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 shadow-[0_2px_4px_rgba(11,181,176,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] border border-brand-200/80">
              <ShieldCheck size={22} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-ink">Trusted stores</p>
              <p className="mt-0.5 text-xs font-medium text-muted">Shop with confidence</p>
            </div>
          </div>
          <div className="card-3d flex items-center gap-3.5 rounded-2card p-4 sm:p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 shadow-[0_2px_4px_rgba(11,181,176,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] border border-brand-200/80">
              <Truck size={22} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-ink">Reliable delivery</p>
              <p className="mt-0.5 text-xs font-medium text-muted">Clear order tracking</p>
            </div>
          </div>
          <div className="card-3d flex items-center gap-3.5 rounded-2card p-4 sm:p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 shadow-[0_2px_4px_rgba(11,181,176,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] border border-brand-200/80">
              <WalletCards size={22} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-ink">Simple checkout</p>
              <p className="mt-0.5 text-xs font-medium text-muted">COD and online payments</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <SectionTitle title="Shop by category" to="/products" />
        {categories.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2card bg-slate-200/80"
              />
            ))}
          </div>
        ) : categories.isError ? (
          <ErrorState onRetry={categories.refetch} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {(categories.data || []).slice(0, 8).map((category) => (
              <Link
                key={category.uid}
                to={`/c/${category.slug}`}
                className="card-3d group rounded-2card p-4 text-center active:scale-95"
              >
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-b from-brand-50 to-brand-100/60 text-xl text-brand-700 shadow-[0_2px_6px_rgba(11,181,176,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] border border-brand-200/80 group-hover:scale-110 transition-transform">
                  ✦
                </div>
                <p className="mt-3 truncate text-xs sm:text-sm font-extrabold text-ink group-hover:text-brand-600 transition-colors">
                  {category.name}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <SectionTitle title="All products" to="/products" />
        <CatalogRow query={allProducts} />
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <SectionTitle title="Top rated" to="/products?sort=rating" />
        <DeferredCatalogRow
          queryKey={["products", { sort: "rating", page_size: 8 }]}
          queryFn={() => listProducts({ sort: "rating", page_size: 8 })}
        />
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <SectionTitle title="New arrivals" to="/products?sort=newest" />
        <DeferredCatalogRow
          queryKey={["products", { sort: "newest", page_size: 8 }]}
          queryFn={() => listProducts({ sort: "newest", page_size: 8 })}
        />
      </section>
    </div>
  );
}
function CatalogRow({ query }) {
  if (query.isLoading) return <ProductGridSkeleton />;
  if (query.isError) return <ErrorState onRetry={query.refetch} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {(query.data?.items || []).map((product, idx) => (
        <ProductCard key={product.uid} product={product} priority={idx < 4} />
      ))}
    </div>
  );
}

function DeferredCatalogRow({ queryKey, queryFn }) {
  const sectionRef = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const query = useQuery({
    queryKey,
    queryFn,
    enabled: nearViewport,
  });

  return (
    <div ref={sectionRef}>
      {!nearViewport || query.isLoading ? (
        <ProductGridSkeleton />
      ) : (
        <CatalogRow query={query} />
      )}
    </div>
  );
}
