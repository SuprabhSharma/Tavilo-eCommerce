import { generateProductPlaceholderSvg } from "./placeholders";

// ── Formatters — module-level singletons ─────────────────────────────────────
// Creating Intl.NumberFormat and Intl.DateTimeFormat inside a render function
// allocates a new heavy object on every call. Hoisting them to module scope
// makes formatting free (just a method call on a cached object).

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export const formatCurrency = (value) => currencyFmt.format(Number(value || 0));

export const formatDate = (value) =>
  value ? dateFmt.format(new Date(value)) : "—";

export const discountPercent = (price, mrp) => {
  const sellingPrice         = Number(price);
  const maximumRetailPrice   = Number(mrp);
  if (
    !Number.isFinite(sellingPrice) ||
    !Number.isFinite(maximumRetailPrice) ||
    maximumRetailPrice <= sellingPrice ||
    maximumRetailPrice <= 0
  ) return 0;
  return (
    Math.round(((maximumRetailPrice - sellingPrice) / maximumRetailPrice) * 10000) / 100
  );
};

export const productImage = (product, index = 0) => {
  const url = product?.images?.[index]?.url;
  if (url) return url;
  const seed = product?.slug || product?.uid || "product";
  return generateProductPlaceholderSvg(seed, product?.title || "");
};

export const orderItemImage = (item) => {
  const url =
    item?.image_url ||
    item?.images?.[0]?.url ||
    item?.product?.images?.[0]?.url;
  if (url) return url;
  const seed =
    item?.product_slug ||
    item?.product_id ||
    item?.title_snapshot ||
    item?.uid ||
    "order-item";
  return generateProductPlaceholderSvg(seed, item?.title_snapshot || "");
};

const VARIANT_RE = /_1600\.webp(\?.*)?$/;

export const imageVariant = (url, width) =>
  url && VARIANT_RE.test(url) ? url.replace(/_1600\.webp/, `_${width}.webp`) : url;

export const imageSrcSet = (url) =>
  VARIANT_RE.test(url || "")
    ? [160, 480, 800, 1600].map((w) => `${imageVariant(url, w)} ${w}w`).join(", ")
    : undefined;
