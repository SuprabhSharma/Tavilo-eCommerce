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
      ? "btn-3d-primary text-white font-semibold"
      : variant === "white"
      ? "btn-3d-white text-ink font-semibold"
      : variant === "accent"
      ? "bg-amber-400 text-slate-950 hover:bg-amber-300 font-semibold shadow-[0_2px_5px_rgba(245,158,11,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]"
      : variant === "soft"
      ? "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 hover:border-brand-300 shadow-[0_1px_2px_rgba(11,181,176,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] font-semibold"
      : variant === "danger"
      ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-semibold shadow-sm"
      : "border border-line bg-white text-ink font-semibold hover:bg-slate-50 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),inset_0_1px_0_#ffffff]";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm tracking-tight transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none ${variantStyles} ${className}`}
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
        className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-ink shadow-[inset_0_1.5px_3px_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15 focus:shadow-sm ${error ? "border-red-400" : "border-line"} ${className}`}
        {...props}
      />
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
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
            className={`h-11 w-full rounded-xl border bg-white px-3.5 pr-11 text-sm text-ink shadow-[inset_0_1.5px_3px_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15 focus:shadow-sm ${error ? "border-red-400" : "border-line"} ${className}`}
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
        {error && <span className="text-xs font-medium text-red-600">{error}</span>}
      </label>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
export const Select = ({ label, children, ...props }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-medium text-ink">{label}</span>
    <select
      className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_#ffffff] outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-500/15"
      {...props}
    >
      {children}
    </select>
  </label>
);
export const Badge = ({ children, tone = "neutral" }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight shadow-sm ${tone === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-300/80" : tone === "warning" ? "bg-amber-50 text-amber-900 border border-amber-300/80" : tone === "danger" ? "bg-red-50 text-red-800 border border-red-300/80" : "bg-slate-100 text-slate-700 border border-slate-300/80"}`}
  >
    {children}
  </span>
);
export const Rating = ({ value = 0, count, compact = false }) => (
  <span className="inline-flex items-center gap-1.5 text-sm">
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white shadow-[0_1px_2px_rgba(5,150,105,0.3),inset_0_1px_0_rgba(255,255,255,0.25)]">
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
