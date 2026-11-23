import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "./ui";
export const PageHeader = ({ eyebrow, title, description, action }) => (
  <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && (
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
      )}
    </div>
    {action}
  </div>
);
export const SectionTitle = ({
  title,
  to = "/products",
  link = "View all",
}) => (
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
    <Link
      to={to}
      className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
    >
      {link}
      <ChevronRight size={16} />
    </Link>
  </div>
);
export const ProductGridSkeleton = () => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="rounded-2card border border-slate-200/90 bg-white p-3 shadow-card">
        <Skeleton className="aspect-square rounded-xl" />
        <Skeleton className="mt-3.5 h-3 w-1/3 rounded-md" />
        <Skeleton className="mt-2 h-4 w-full rounded-md" />
        <Skeleton className="mt-3 h-5 w-1/2 rounded-md" />
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
      </div>
    ))}
  </div>
);
export const BackLink = ({ to = -1, children = "Back" }) => (
  <Link
    to={to}
    className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-brand-600"
  >
    <ArrowLeft size={16} />
    {children}
  </Link>
);
export const QueryState = ({
  query,
  children,
  emptyTitle = "No products found",
}) =>
  query.isLoading ? (
    <ProductGridSkeleton />
  ) : query.isError ? (
    <ErrorState onRetry={() => query.refetch()} />
  ) : query.data?.items?.length ? (
    children
  ) : (
    <EmptyState
      title={emptyTitle}
      description="Try a different search or browse another category."
      action={
        <Button variant="soft" onClick={() => window.history.back()}>
          Go back
        </Button>
      }
    />
  );
