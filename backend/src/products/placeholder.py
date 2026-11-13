"""
Dynamic SVG placeholder generator for products in Tavilo.
High-contrast, beautifully styled, zero external dependencies.
"""
from typing import Optional

PALETTES = [
    {"bg1": "#F1F5F9", "bg2": "#E2E8F0", "accent": "#0F766E", "badge": "#14B8A6"},
    {"bg1": "#EFF6FF", "bg2": "#DBEAFE", "accent": "#1D4ED8", "badge": "#3B82F6"},
    {"bg1": "#F5F3FF", "bg2": "#EDE9FE", "accent": "#6D28D9", "badge": "#8B5CF6"},
    {"bg1": "#FFF7ED", "bg2": "#FFEDD5", "accent": "#C2410C", "badge": "#F97316"},
    {"bg1": "#F0FDF4", "bg2": "#DCFCE7", "accent": "#15803D", "badge": "#22C55E"},
    {"bg1": "#FFF1F2", "bg2": "#FFE4E6", "accent": "#BE123C", "badge": "#F43F5E"},
]


def hash_seed(seed: str) -> int:
    h = 0
    for ch in str(seed or "tavilo"):
        h = ((h << 5) - h) + ord(ch)
        h &= 0xFFFFFFFF
    return abs(h)


def generate_product_svg(seed: str = "product", title: Optional[str] = None) -> str:
    h = hash_seed(seed)
    p = PALETTES[h % len(PALETTES)]
    safe_title = (title or "").replace("<", "").replace(">", "").replace("&", "")[:24]

    title_elem = (
        f'<text x="200" y="340" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="500" fill="#64748B">{safe_title}</text>'
        if safe_title
        else ""
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none">
  <defs>
    <linearGradient id="g_{h}" x1="0" y1="0" x2="400" y2="400" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="{p['bg1']}"/>
      <stop offset="100%" stop-color="{p['bg2']}"/>
    </linearGradient>
    <filter id="f_{h}" x="120" y="110" width="160" height="170" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="400" height="400" fill="url(#g_{h})"/>
  <g filter="url(#f_{h})">
    <rect x="135" y="140" width="130" height="130" rx="20" fill="#FFFFFF"/>
    <path d="M170 140V125C170 108.431 183.431 95 200 95C216.569 95 230 108.431 230 125V140" stroke="{p['accent']}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="200" cy="195" r="24" fill="{p['bg2']}"/>
    <path d="M192 195L198 201L210 189" stroke="{p['accent']}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="200" y="315" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="700" letter-spacing="3" fill="{p['accent']}" opacity="0.9">TAVILO</text>
  {title_elem}
</svg>"""
