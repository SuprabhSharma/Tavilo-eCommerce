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
      <section className="bg-brand-700 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1.1fr_.9fr] md:py-20 lg:px-8">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
              {brand.tagline}
            </p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
              A better way to find what fits your life.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-blue-100">
              Explore thoughtful products from independent stores, with clear
              prices and a checkout that stays simple.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-brand-700 hover:bg-blue-50"
              >
                Start exploring <ArrowRight size={17} />
              </Link>
              <Link
                to="/products?sort=rating"
                className="inline-flex min-h-11 items-center rounded-lg border border-blue-300 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Top rated
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative mx-auto max-w-sm rounded-[2rem] bg-white/10 p-4">
              <div className="rounded-[1.5rem] bg-white p-5 text-ink shadow-float">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
                  Curated today
                </p>
                <p className="mt-3 text-2xl font-bold">
                  Small stores.
                  <br />
                  Big personality.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-700">
                    ✦
                  </span>
                  <p className="text-sm text-muted">
                    Good products are closer than you think.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex gap-3 rounded-card border border-line bg-white p-4">
            <ShieldCheck className="text-brand-600" />
            <div>
              <p className="text-sm font-semibold">Trusted stores</p>
              <p className="mt-1 text-xs text-muted">Shop with confidence</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-card border border-line bg-white p-4">
            <Truck className="text-brand-600" />
            <div>
              <p className="text-sm font-semibold">Reliable delivery</p>
              <p className="mt-1 text-xs text-muted">Clear order tracking</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-card border border-line bg-white p-4">
            <WalletCards className="text-brand-600" />
            <div>
              <p className="text-sm font-semibold">Simple checkout</p>
              <p className="mt-1 text-xs text-muted">COD and online payments</p>
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
                className="h-24 animate-pulse rounded-card bg-slate-200"
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
                className="group rounded-card border border-line bg-white p-4 text-center transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-card"
              >
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-lg text-brand-600">
                  ✦
                </div>
                <p className="mt-3 truncate text-sm font-semibold group-hover:text-brand-600">
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
      {(query.data?.items || []).map((product) => (
        <ProductCard key={product.uid} product={product} />
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
