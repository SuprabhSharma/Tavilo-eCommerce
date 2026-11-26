import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getVendor, listProducts, listServices } from "../api/catalog";
import ProductCard from "../components/ProductCard";
import { BackLink, ProductGridSkeleton } from "../components/Page";
import { Button, ErrorState } from "../components/ui";

export default function VendorStore() {
  const { slug } = useParams();
  const vendor = useQuery({
    queryKey: ["vendor", slug],
    queryFn: () => getVendor(slug),
  });
  const products = useInfiniteQuery({
    queryKey: ["products", { vendor: slug, page_size: 20, include_total: false }],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      listProducts(
        { vendor: slug, page_size: 20, include_total: false, cursor: pageParam || undefined },
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
  });
  const services = useInfiniteQuery({
    queryKey: ["services", { vendor: slug, page_size: 12 }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listServices({ vendor: slug, page: pageParam, page_size: 12 }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
  });

  const productItems = useMemo(
    () => products.data?.pages.flatMap((page) => page.items) ?? [],
    [products.data],
  );
  const serviceItems = useMemo(
    () => services.data?.pages.flatMap((page) => page.items) ?? [],
    [services.data],
  );

  if (vendor.isLoading)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ProductGridSkeleton />
      </div>
    );
  if (vendor.isError)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ErrorState onRetry={vendor.refetch} />
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BackLink />
      <section className="rounded-card bg-brand-700 p-6 text-white sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white text-3xl font-bold text-brand-600">
            {vendor.data.store_name?.[0]}
          </div>
          <div>
            <p className="text-sm text-blue-100">Tavilo store</p>
            <h1 className="mt-1 text-3xl font-bold">
              {vendor.data.store_name}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
              {vendor.data.description ||
                "A trusted independent store on Tavilo."}
            </p>
          </div>
        </div>
      </section>
      <div className="mt-10">
        {products.isLoading ? (
          <ProductGridSkeleton />
        ) : products.isError && productItems.length === 0 ? (
          <ErrorState onRetry={products.refetch} />
        ) : (
          <>
            <h2 className="mb-5 text-xl font-bold">Store products</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {productItems.map((product, idx) => (
                <ProductCard key={product.uid} product={product} priority={idx < 4} />
              ))}
            </div>
            {products.hasNextPage && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  loading={products.isFetchingNextPage}
                  onClick={() => products.fetchNextPage()}
                >
                  Load more products
                </Button>
              </div>
            )}
          </>
        )}
        {services.isLoading ? (
          <div className="mt-10">
            <ProductGridSkeleton />
          </div>
        ) : services.isError ? null : serviceItems.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-5 text-xl font-bold">Services</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {serviceItems.map((service) => (
                <article
                  key={service.uid}
                  className="rounded-card border border-line bg-white p-5"
                >
                  <h3 className="font-bold">{service.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {service.description || "Service offered by this store."}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-brand-700">
                    {service.price} &middot; {service.duration_minutes} minutes
                  </p>
                </article>
              ))}
            </div>
            {services.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  loading={services.isFetchingNextPage}
                  onClick={() => services.fetchNextPage()}
                >
                  Load more services
                </Button>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
