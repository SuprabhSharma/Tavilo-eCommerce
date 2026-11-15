/**
 * ProductImage — production-grade image component for Tavilo.
 *
 * Features:
 *  • Multi-size srcset / sizes support
 *  • Shimmer skeleton while loading (no layout shift)
 *  • One-time variant fallback to base _1600 URL before SVG fallback
 *  • decoding="async" + fetchpriority for LCP images
 */
import { useEffect, useRef, useState } from "react";
import { generateProductPlaceholderSvg } from "../lib/placeholders";

function buildFallback(seed, title) {
  return generateProductPlaceholderSvg(seed || "product", title || "");
}

export default function ProductImage({
  src,
  srcSet,
  sizes,
  alt = "",
  fallbackSeed,
  className = "",
  loading = "lazy",
  fetchPriority = "auto",
  width,
  height,
  draggable = false,
}) {
  const [retryWithBase, setRetryWithBase] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  // Check if image is already cached/complete on mount or when src changes
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src, retryWithBase]);

  // Derive active image URL
  let currentSrc = src;
  let currentSrcSet = srcSet;

  if (errored || !src) {
    currentSrc = buildFallback(fallbackSeed || alt || "product", alt);
    currentSrcSet = undefined;
  } else if (retryWithBase && /_\d+\.webp/.test(src)) {
    // Retry once with the canonical _1600 base URL if a variant 404ed
    currentSrc = src.replace(/_\d+\.webp/, "_1600.webp");
    currentSrcSet = undefined;
  }

  const isDataUri = currentSrc?.startsWith("data:");

  const handleError = () => {
    if (!retryWithBase && /_\d+\.webp/.test(src || "")) {
      setRetryWithBase(true);
    } else if (!errored) {
      setErrored(true);
    }
  };

  const handleLoad = () => {
    setLoaded(true);
  };

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!loaded && !isDataUri && (
        <span
          className="absolute inset-0 animate-pulse bg-slate-200"
          aria-hidden="true"
        />
      )}
      <img
        ref={imgRef}
        src={currentSrc}
        srcSet={currentSrcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchpriority={fetchPriority}
        draggable={draggable}
        onError={handleError}
        onLoad={handleLoad}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          loaded || isDataUri ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}
