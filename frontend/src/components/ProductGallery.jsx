import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const SWIPE_DISTANCE = 48;

function normaliseImages(images, fallback) {
  const source = (images || [])
    .map((image) => (typeof image === "string" ? { url: image } : image))
    .filter((image) => image?.url);
  return source.length ? source : [{ url: fallback }];
}

/** Accessible, touch-friendly product image gallery. */
export default function ProductGallery({
  images,
  fallback,
  alt,
  initialIndex = 0,
  onIndexChange,
  className = "",
  showLightbox = false,
}) {
  const galleryImages = normaliseImages(images, fallback);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), galleryImages.length - 1),
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const thumbnailRefs = useRef([]);
  const pointerStart = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    setActiveIndex((current) => {
      const next = Math.min(current, galleryImages.length - 1);
      onIndexChange?.(next);
      return next;
    });
  }, [galleryImages.length, onIndexChange]);

  useEffect(() => {
    thumbnailRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeIndex]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

  const selectImage = (index) => {
    const next = Math.min(Math.max(index, 0), galleryImages.length - 1);
    setActiveIndex(next);
    onIndexChange?.(next);
  };

  const move = (direction) => {
    if (galleryImages.length < 2) return;
    const next = activeIndex + direction;
    if (next < 0 || next >= galleryImages.length) return;
    selectImage(next);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectImage(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectImage(galleryImages.length - 1);
    }
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (event) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY)) return;
    suppressClick.current = true;
    move(deltaX < 0 ? 1 : -1);
  };

  const openLightbox = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setLightboxOpen(true);
  };

  const image = galleryImages[activeIndex];
  const imageLabel = `${alt}, image ${activeIndex + 1} of ${galleryImages.length}`;

  const renderImage = (item, index, className = "") => (
    <img
      src={item.url}
      alt={`${alt}, image ${index + 1} of ${galleryImages.length}`}
      width="800"
      height="800"
      draggable="false"
      className={`aspect-square w-full select-none ${className || "object-cover"}`}
    />
  );

  return (
    <>
      <div
        className={`grid gap-3 sm:grid-cols-[80px_1fr] ${className}`}
        aria-label={`${alt} image gallery`}
        onKeyDown={handleKeyDown}
      >
        <div
          className="order-2 flex gap-2 overflow-x-auto overscroll-contain pb-1 sm:order-1 sm:max-h-[min(42rem,calc(100vh-10rem))] sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:pb-0"
          role="tablist"
          aria-label={`${alt} thumbnails`}
        >
          {galleryImages.map((item, index) => (
            <button
              key={item.uid || `${item.url}-${index}`}
              ref={(node) => {
                thumbnailRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              aria-label={`View image ${index + 1} of ${galleryImages.length}`}
              onClick={() => selectImage(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:h-[72px] sm:w-[72px] ${
                activeIndex === index
                  ? "border-brand-600 shadow-[0_0_0_2px_rgba(11,181,176,0.18)]"
                  : "border-transparent opacity-75 hover:border-brand-200 hover:opacity-100"
              }`}
            >
              <img
                src={item.url}
                alt=""
                width="72"
                height="72"
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable="false"
                className="h-full w-full object-cover"
              />
              {activeIndex === index && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-600" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        <div
          className="relative order-1 touch-pan-y overflow-hidden rounded-card bg-slate-100 sm:order-2"
          tabIndex="0"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          onDoubleClick={() => showLightbox && setLightboxOpen(true)}
        >
          <div
            className="flex transform-gpu transition-transform duration-700 ease-in-out will-change-transform"
            style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
          >
            {galleryImages.map((item, index) => (
              <div key={item.uid || `${item.url}-${index}`} className="min-w-full">
                {showLightbox ? (
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset"
                    onClick={openLightbox}
                    aria-label={`Open ${alt}, image ${index + 1} of ${galleryImages.length} in full-screen preview`}
                  >
                    {renderImage(item, index)}
                  </button>
                ) : (
                  renderImage(item, index)
                )}
              </div>
            ))}
          </div>

          {galleryImages.length > 1 && (
            <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/75 px-2.5 py-1 text-xs font-semibold text-white" aria-live="polite">
              {activeIndex + 1} / {galleryImages.length}
            </span>
          )}
        </div>
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} full-screen image preview`}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close full-screen preview"
          >
            <X size={24} />
          </button>
          <div
            className="relative flex max-h-full w-[min(90vw,64rem)] items-center overflow-hidden touch-pan-y"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            tabIndex="0"
          >
            <div
              className="flex w-full transform-gpu transition-transform duration-700 ease-in-out will-change-transform"
              style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
            >
              {galleryImages.map((item, index) => (
                <div key={item.uid || `${item.url}-${index}`} className="flex min-w-full justify-center">
                  {renderImage(item, index, "max-h-[88vh] max-w-full object-contain")}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
