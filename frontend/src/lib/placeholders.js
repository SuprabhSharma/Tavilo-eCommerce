/**
 * Bulletproof, instant SVG placeholder generator for Tavilo e-commerce.
 *
 * 100% self-contained, 0ms latency, zero network dependency.
 * Works offline, behind firewalls, and at infinite scale.
 */

const PALETTES = [
  { bg1: "#F1F5F9", bg2: "#E2E8F0", accent: "#0F766E", badge: "#14B8A6", label: "Tavilo" }, // teal
  { bg1: "#EFF6FF", bg2: "#DBEAFE", accent: "#1D4ED8", badge: "#3B82F6", label: "Tavilo" }, // blue
  { bg1: "#F5F3FF", bg2: "#EDE9FE", accent: "#6D28D9", badge: "#8B5CF6", label: "Tavilo" }, // purple
  { bg1: "#FFF7ED", bg2: "#FFEDD5", accent: "#C2410C", badge: "#F97316", label: "Tavilo" }, // amber
  { bg1: "#F0FDF4", bg2: "#DCFCE7", accent: "#15803D", badge: "#22C55E", label: "Tavilo" }, // emerald
  { bg1: "#FFF1F2", bg2: "#FFE4E6", accent: "#BE123C", badge: "#F43F5E", label: "Tavilo" }, // rose
];

function hashSeed(seed) {
  let hash = 0;
  const str = String(seed || "tavilo");
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateProductPlaceholderSvg(seed = "product", title = "") {
  const hash = hashSeed(seed);
  const palette = PALETTES[hash % PALETTES.length];
  const safeTitle = (title || "").slice(0, 24).replace(/[<>&"]/g, "");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none">
    <defs>
      <linearGradient id="g_${hash}" x1="0" y1="0" x2="400" y2="400" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${palette.bg1}"/>
        <stop offset="100%" stop-color="${palette.bg2}"/>
      </linearGradient>
      <filter id="f_${hash}" x="120" y="110" width="160" height="170" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.08"/>
      </filter>
    </defs>
    <rect width="400" height="400" fill="url(#g_${hash})"/>
    
    <!-- Modern Shopping Bag / Product Box Graphic with Drop Shadow -->
    <g filter="url(#f_${hash})">
      <rect x="135" y="140" width="130" height="130" rx="20" fill="#FFFFFF"/>
      <path d="M170 140V125C170 108.431 183.431 95 200 95C216.569 95 230 108.431 230 125V140" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="200" cy="195" r="24" fill="${palette.bg2}"/>
      <path d="M192 195L198 201L210 189" stroke="${palette.accent}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <!-- Brand & Title Label -->
    <text x="200" y="315" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" letter-spacing="3" fill="${palette.accent}" opacity="0.9">TAVILO</text>
    ${safeTitle ? `<text x="200" y="340" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="500" fill="#64748B">${safeTitle}</text>` : ""}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
