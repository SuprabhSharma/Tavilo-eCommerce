/**
 * ProductImage — production-grade image component for Tavilo.
 *
 * Features:
 *  • Shimmer skeleton while loading (no layout shift)
 *  • onError fallback to local SVG placeholder (zero network, always visible)
 *  • decoding="async" + loading prop forwarded
 *  • fetchpriority for LCP images (lowercase — works across all React 18.x)
 *  • Wraps <img> so callers never worry about broken src
 */
import { useEffect, useState } from "react";
import { generateProductPlaceholderSvg } from "../lib/placeholders";

function buildFallback(seed, title) {
  return generateProductPlaceholderSvg(seed || "product", title || "");
}

/**
 * @param {object} props
 * @param {string}  props.src            Primary image URL.
 * @param {string}  props.alt            Alt text (required for a11y).
 * @param {string}  [props.fallbackSeed] Seed used for the placeholder.
 * @param {string}  [props.className]    Tailwind classes forwarded to <img>.
 * @param {string}  [props.loading]      "lazy" | "eager"  (default: "lazy")
 * @param {string}  [props.fetchPriority] "high" | "auto" | "low"
 * @param {number}  [props.width]
 * @param {number}  [props.height]
 */
export default function ProductImage({
  src,
  alt,
  fallbackSeed,
  className = "",
  loading = "lazy",
  // Accept camelCase from callers (React component convention), but map to
  // the lowercase HTML attribute on the <img> to avoid the React warning on
  // versions < 18.3 that don't recognise camelCase fetchPriority on DOM nodes.
  fetchPriority = "auto",
  width,
  height,
  draggable = false,
}) {
  const resolved = (!src || src.includes("picsum.photos"))
    ? buildFallback(fallbackSeed || alt || "product", alt)
    : src;

  const [imgSrc, setImgSrc] = useState(resolved);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const next = (!src || src.includes("picsum.photos"))
      ? buildFallback(fallbackSeed || alt || "product", alt)
      : src;
    setImgSrc(next);
    setErrored(false);
  }, [src, fallbackSeed, alt]);

  const handleError = () => {
    if (!errored) {
      setErrored(true);
      setImgSrc(buildFallback(fallbackSeed || alt || "product", alt));
    }
  };

  const handleLoad = () => setLoaded(true);

  return (
    <span className="relative block overflow-hidden">
      {/* Shimmer skeleton shown until image loads */}
      {!loaded && (
        <span
          className="absolute inset-0 animate-pulse bg-slate-200"
          aria-hidden="true"
        />
      )}
      {/* Use lowercase fetchpriority (HTML attr) — avoids React < 18.3 warning */}
      <img
        src={imgSrc}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchpriority={fetchPriority}
        draggable={draggable}
        onError={handleError}
        onLoad={handleLoad}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
      />
    </span>
  );
}
