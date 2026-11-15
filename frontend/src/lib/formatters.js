import { generateProductPlaceholderSvg } from "./placeholders";

export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
export const discountPercent = (price, mrp) => {
  const sellingPrice = Number(price);
  const maximumRetailPrice = Number(mrp);
  if (
    !Number.isFinite(sellingPrice) ||
    !Number.isFinite(maximumRetailPrice) ||
    maximumRetailPrice <= sellingPrice ||
    maximumRetailPrice <= 0
  )
    return 0;
  return (
    Math.round(
      ((maximumRetailPrice - sellingPrice) / maximumRetailPrice) * 10000,
    ) / 100
  );
};
export const productImage = (product, index = 0) => {
  const url = product?.images?.[index]?.url;
  // If the image URL is missing or points to an unreliable external placeholder
  // like picsum.photos, return the instant local SVG placeholder.
  if (url && !url.includes("picsum.photos")) return url;
  const seed = product?.slug || product?.uid || "product";
  return generateProductPlaceholderSvg(seed, product?.title || "");
};

export const orderItemImage = (item) => {
  const url =
    item?.image_url ||
    item?.images?.[0]?.url ||
    item?.product?.images?.[0]?.url;
  if (url && !url.includes("picsum.photos")) return url;
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
