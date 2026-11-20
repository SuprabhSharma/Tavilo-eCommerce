import { forwardRef, useState } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  PackageOpen,
  RefreshCcw,
  Search,
  Star,
} from "lucide-react";

export const Button = ({
  variant = "primary",
  loading,
  children,
  className = "",
  ...props
}) => {
  const variantStyles =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : variant === "white"
      ? "bg-white text-slate-900 hover:bg-slate-100 shadow-sm font-semibold"
      : variant === "accent"
      ? "bg-brand-400 text-slate-950 hover:bg-brand-300 font-bold"
      : variant === "soft"
      ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
      : variant === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "border border-line bg-white text-ink hover:bg-slate-50";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantStyles} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
};
export const Input = forwardRef(
  ({ label, error, className = "", ...props }, ref) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        ref={ref}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${error ? "border-red-400" : "border-line"} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  ),
);
Input.displayName = "Input";
export const PasswordInput = forwardRef(
  ({ label, error, className = "", ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="relative block">
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            className={`h-11 w-full rounded-lg border bg-white px-3 pr-11 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${error ? "border-red-400" : "border-line"} ${className}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            title={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </label>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
export const Select = ({ label, children, ...props }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-medium text-ink">{label}</span>
    <select
      className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      {...props}
    >
      {children}
    </select>
  </label>
);
export const Badge = ({ children, tone = "neutral" }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "success" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : tone === "danger" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}
  >
    {children}
  </span>
);
export const Rating = ({ value = 0, count, compact = false }) => (
  <span className="inline-flex items-center gap-1 text-sm">
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 font-semibold text-white">
      <Star size={compact ? 11 : 13} fill="currentColor" />
      {Number(value).toFixed(1)}
    </span>
    {count !== undefined && (
      <span className="text-xs text-muted">({count})</span>
    )}
  </span>
);
export const Skeleton = ({ className = "" }) => (
  <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />
);
export const EmptyState = ({
  title = "Nothing here yet",
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-white px-6 py-16 text-center">
    <PackageOpen className="mb-3 text-slate-400" size={36} />
    <h3 className="font-semibold text-ink">{title}</h3>
    {description && (
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
export const ErrorState = ({ onRetry, message }) => (
  <div className="flex flex-col items-center justify-center rounded-card border border-red-100 bg-red-50 px-6 py-12 text-center">
    <p className="font-semibold text-red-800">We couldn’t load this content.</p>
    <p className="mt-1 text-sm text-red-700">
      {message || "Check your connection and try again."}
    </p>
    {onRetry && (
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCcw size={16} />
        Try again
      </Button>
    )}
  </div>
);
export const SearchIcon = Search;
