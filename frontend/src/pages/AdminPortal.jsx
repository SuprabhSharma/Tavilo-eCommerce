import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Routes } from "react-router-dom";
import {
  Check,
  LayoutDashboard,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import {
  approveVendor,
  getAdminStats,
  getPendingVendorsPage,
  suspendVendor,
} from "../api/vendor";
import { PageHeader } from "../components/Page";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatDate } from "../lib/formatters";
import { useAuthStore } from "../store/authStore";

const navItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/vendors", label: "Vendor approvals", icon: Store },
];

export default function AdminPortal() {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold">Admin console</h1>
        </div>
        <span className="text-sm text-muted">Signed in as {user?.email}</span>
      </div>
      <div className="grid gap-7 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-card border border-line bg-white p-3">
          <div className="mb-3 rounded-lg bg-slate-900 p-3 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Tavilo ops
            </p>
            <p className="mt-1 text-sm font-medium">Review and manage</p>
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink"
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>
          <Routes>
            <Route index element={<AdminOverview />} />
            <Route path="vendors" element={<VendorApprovals />} />
            <Route path="*" element={<AdminOverview />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AdminOverview() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: getAdminStats });
  const pending = useQuery({
    queryKey: ["pending-vendors-page", 1, 4],
    queryFn: () => getPendingVendorsPage({ page: 1, page_size: 4 }),
  });
  if (stats.isError) return <ErrorState onRetry={stats.refetch} />;
  const data = stats.data || {};
  const pendingItems = pending.data?.items || [];
  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Tavilo health"
        description="A quick view of Tavilo and the work waiting for review."
        action={
          <Link
            to="/admin/vendors"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Review vendors
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Users", data.users, Users],
          ["Approved vendors", data.vendors, Store],
          ["Live products", data.products, ShieldCheck],
          ["Orders", data.orders, LayoutDashboard],
        ].map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-card border border-line bg-white p-5"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon size={18} />
            </span>
            <p className="mt-5 text-2xl font-bold">
              {stats.isLoading ? "—" : (value ?? 0)}
            </p>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="rounded-card border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Pending approvals</h2>
            <Link
              to="/admin/vendors"
              className="text-sm font-semibold text-brand-600"
            >
              View queue
            </Link>
          </div>
          {pending.isLoading ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : pendingItems.length ? (
            <div className="mt-4 divide-y divide-line">
              {pendingItems.map((vendor) => (
                <div
                  key={vendor.uid}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{vendor.store_name}</p>
                    <p className="mt-1 text-xs text-muted">
                      Submitted {formatDate(vendor.created_at)}
                    </p>
                  </div>
                  <Badge tone="warning">pending</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Queue is clear"
              description="There are no vendor applications waiting for review."
            />
          )}
        </section>
        <section className="rounded-card border border-line bg-slate-900 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Gross order value
          </p>
          <p className="mt-3 text-3xl font-bold">
            {stats.isLoading ? "—" : formatCurrency(data.revenue || 0)}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Total value of orders processed through Tavilo.
          </p>
        </section>
      </div>
    </div>
  );
}

function VendorApprovals() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pending = useQuery({
    queryKey: ["pending-vendors-page", page, pageSize],
    queryFn: () => getPendingVendorsPage({ page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  const [error, setError] = useState("");
  const action = useMutation({
    mutationFn: ({ uid, type }) =>
      type === "approve" ? approveVendor(uid) : suspendVendor(uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-vendors-page"] });
      queryClient.invalidateQueries({ queryKey: ["pending-vendors"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  const items = pending.data?.items || [];
  const total = pending.data?.total ?? 0;
  const pages = pending.data?.pages ?? 0;
  return (
    <div>
      <PageHeader
        eyebrow="Vendor management"
        title="Approval queue"
        description="Review store details before vendors can publish products and appear in Tavilo."
      />
      <div className="mb-5 flex items-center justify-between rounded-card border border-brand-100 bg-brand-50 p-4">
        <div>
          <p className="text-sm font-semibold text-brand-900">
            {total} applications waiting
          </p>
          <p className="mt-1 text-xs text-brand-800">
            Approved vendors can immediately manage their catalogue.
          </p>
        </div>
        <ShieldCheck className="text-brand-600" size={22} />
      </div>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {pending.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : pending.isError ? (
        <ErrorState onRetry={pending.refetch} />
      ) : !items.length ? (
        <EmptyState
          title="No pending applications"
          description="New vendor applications will show up here."
        />
      ) : (
        <>
          <div className="space-y-4">
            {items.map((vendor) => (
              <article
                key={vendor.uid}
                className="rounded-card border border-line bg-white p-5 sm:p-6"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg font-bold text-brand-600">
                      {vendor.store_name?.[0]}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{vendor.store_name}</h2>
                        <Badge tone="warning">pending</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        /{vendor.slug} &middot; Submitted{" "}
                        {formatDate(vendor.created_at)}
                      </p>
                      <p className="mt-4 max-w-2xl text-sm leading-6 text-ink">
                        {vendor.description || "No description provided."}
                      </p>
                      {vendor.logo_url && (
                        <a
                          href={vendor.logo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-block text-xs font-semibold text-brand-600"
                        >
                          View logo URL
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      loading={
                        action.isPending &&
                        action.variables?.uid === vendor.uid &&
                        action.variables?.type === "approve"
                      }
                      onClick={() =>
                        action.mutate({ uid: vendor.uid, type: "approve" })
                      }
                    >
                      <Check size={16} /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      loading={
                        action.isPending &&
                        action.variables?.uid === vendor.uid &&
                        action.variables?.type === "suspend"
                      }
                      onClick={() =>
                        action.mutate({ uid: vendor.uid, type: "suspend" })
                      }
                    >
                      <X size={16} /> Reject
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {pages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
              <span className="text-muted">
                Page {page} of {pages} ({total} pending)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
