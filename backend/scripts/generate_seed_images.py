"""Generate 180 high quality, professional seed product images (Phase 3.1).

60 products x 3 angles/variants (front, alternate, detail) = 180 images.
All images are rendered on 1600x1600 pure white background, processed through
the real production `process_image()` pipeline into WebP variants:
  160, 480, 800, 1600.
"""

import io
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

from src.products.image_storage import process_image

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "seed_assets" / "products"

CATEGORIES = [
    ("Electronics", None),
    ("Smartphones", "Electronics"),
    ("Laptops", "Electronics"),
    ("Fashion", None),
    ("Men's Clothing", "Fashion"),
    ("Women's Clothing", "Fashion"),
    ("Books", None),
    ("Home & Kitchen", None),
]

PRODUCT_TEMPLATES = [
    ("Samsung Galaxy S24", "Smartphones"),
    ("iPhone 15 Pro", "Smartphones"),
    ("OnePlus 12", "Smartphones"),
    ("Redmi Note 13 Pro", "Smartphones"),
    ("POCO X6 Pro", "Smartphones"),
    ("Dell XPS 15", "Laptops"),
    ("MacBook Air M3", "Laptops"),
    ("Lenovo ThinkPad X1", "Laptops"),
    ("HP Pavilion 15", "Laptops"),
    ("Asus ZenBook 14", "Laptops"),
    ("Levi's 511 Jeans", "Men's Clothing"),
    ("Allen Solly Formal Shirt", "Men's Clothing"),
    ("Nike Dri-FIT T-Shirt", "Men's Clothing"),
    ("Peter England Chinos", "Men's Clothing"),
    ("Van Heusen Blazer", "Men's Clothing"),
    ("Zara Floral Dress", "Women's Clothing"),
    ("H&M Casual Kurti", "Women's Clothing"),
    ("AND Formal Blazer", "Women's Clothing"),
    ("W for Woman Salwar", "Women's Clothing"),
    ("Biba Ethnic Jacket", "Women's Clothing"),
    ("Atomic Habits", "Books"),
    ("The Psychology of Money", "Books"),
    ("Rich Dad Poor Dad", "Books"),
    ("Deep Work", "Books"),
    ("Zero to One", "Books"),
    ("Philips Air Fryer HD9200", "Home & Kitchen"),
    ("Prestige Iris Induction", "Home & Kitchen"),
    ("Instant Pot Duo", "Home & Kitchen"),
    ("Milton Thermosteel Bottle", "Home & Kitchen"),
    ("Pigeon Mini Cooker", "Home & Kitchen"),
    ("Sony WH-1000XM5 Headphones", "Electronics"),
    ("boAt Rockerz 450 Pro", "Electronics"),
    ("JBL Flip 6 Speaker", "Electronics"),
    ("Realme Buds Air 5", "Electronics"),
    ("Apple Watch Series 9", "Electronics"),
    ("Mi Smart Band 8", "Electronics"),
    ("Noise ColorFit Ultra", "Electronics"),
    ("Canon EOS 1500D", "Electronics"),
    ("GoPro Hero 12", "Electronics"),
    ("Logitech MX Master 3S", "Electronics"),
    ("Corsair K95 RGB Keyboard", "Electronics"),
    ('Samsung 27" Curved Monitor', "Electronics"),
    ("WD My Passport 2TB", "Electronics"),
    ("SanDisk 1TB SSD", "Electronics"),
    ("Anker 65W GaN Charger", "Electronics"),
    ("U.S. Polo Assn. Sneakers", "Men's Clothing"),
    ("Raymond Wool Suit", "Men's Clothing"),
    ("Fabindia Cotton Kurta", "Men's Clothing"),
    ("Myntra Hoodie", "Men's Clothing"),
    ("Puma Running Shoes", "Men's Clothing"),
    ("Global Desi Anarkali", "Women's Clothing"),
    ("FabAlley Co-ord Set", "Women's Clothing"),
    ("Aurelia Linen Tunic", "Women's Clothing"),
    ("Marks & Spencer Jeans", "Women's Clothing"),
    ("SATYA PAUL Silk Saree", "Women's Clothing"),
    ("Think and Grow Rich", "Books"),
    ("The Lean Startup", "Books"),
    ("Sapiens", "Books"),
    ("The Alchemist", "Books"),
    ("1984 by George Orwell", "Books"),
]

PALETTES = [
    ("#1E293B", "#38BDF8", "#0EA5E9"),  # Slate / Sky
    ("#0F172A", "#818CF8", "#4F46E5"),  # Indigo
    ("#14532D", "#4ADE80", "#16A34A"),  # Emerald
    ("#701A75", "#F472B6", "#DB2777"),  # Pink / Fuchsia
    ("#7C2D12", "#FB923C", "#EA580C"),  # Amber / Orange
    ("#1E1B4B", "#A78BFA", "#7C3AED"),  # Violet
    ("#134E4A", "#2DD4BF", "#0D9488"),  # Teal
    ("#831843", "#FB7185", "#E11D48"),  # Rose
]


def draw_shadow(draw: ImageDraw.ImageDraw, bbox: list[int]):
    x0, y0, x1, y1 = bbox
    # Multiple soft translucent concentric ellipses for smooth ground shadow
    for offset in range(12, 0, -2):
        shade = 255 - int(25 * (14 - offset) / 14)
        color = (shade, shade, shade)
        draw.ellipse([x0 - offset * 4, y0 - offset, x1 + offset * 4, y1 + offset], fill=color)


def draw_smartphone(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]
    body_color = colors[0] if shot != 2 else colors[2]
    screen_color = "#020617" if shot != 3 else colors[1]

    # Ground shadow
    draw_shadow(draw, [400, 1420, 1200, 1470])

    if shot in (1, 2):
        # Phone body
        draw.rounded_rectangle([500, 240, 1100, 1420], radius=70, fill=body_color, outline="#64748B", width=6)
        # Screen
        draw.rounded_rectangle([525, 265, 1075, 1395], radius=50, fill=screen_color)
        # Wallpaper graphic on screen
        draw.ellipse([600, 450, 1000, 850], fill=colors[1])
        draw.ellipse([550, 750, 1050, 1250], fill=colors[2])
        # Punch hole camera
        draw.ellipse([785, 300, 815, 330], fill="#000000")
        # Speaker grill
        draw.rounded_rectangle([750, 275, 850, 285], radius=4, fill="#475569")
    else:
        # Back view
        draw.rounded_rectangle([500, 240, 1100, 1420], radius=70, fill=body_color, outline="#64748B", width=6)
        # Camera island
        draw.rounded_rectangle([540, 280, 820, 620], radius=40, fill="#0F172A", outline="#334155", width=4)
        # Lenses
        for cy in [350, 470]:
            draw.ellipse([580, cy - 45, 670, cy + 45], fill="#1E293B", outline="#64748B", width=4)
            draw.ellipse([605, cy - 20, 645, cy + 20], fill="#0284C7")
        draw.ellipse([720, 400 - 40, 790, 400 + 30], fill="#1E293B", outline="#64748B", width=4)
        # Flash
        draw.ellipse([735, 520, 775, 560], fill="#FEF08A")


def draw_laptop(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]
    chassis_color = "#334155" if shot != 2 else "#1E293B"

    draw_shadow(draw, [250, 1380, 1350, 1450])

    if shot in (1, 2):
        # Open laptop display lid
        draw.rounded_rectangle([400, 320, 1200, 950], radius=24, fill=chassis_color, outline="#64748B", width=4)
        # Screen
        draw.rectangle([430, 350, 1170, 920], fill="#020617")
        # Wallpaper inside screen
        draw.polygon([(430, 920), (800, 500), (1170, 920)], fill=colors[2])
        draw.ellipse([650, 420, 950, 720], fill=colors[1])
        # Webcam dot
        draw.ellipse([795, 332, 805, 342], fill="#000000")
        # Base keyboard deck (perspective trapezoid)
        draw.polygon([(400, 950), (1200, 950), (1360, 1380), (240, 1380)], fill=chassis_color, outline="#475569")
        # Keyboard area
        draw.polygon([(440, 970), (1160, 970), (1250, 1200), (350, 1200)], fill="#0F172A")
        # Trackpad
        draw.polygon([(670, 1230), (930, 1230), (950, 1350), (650, 1350)], fill="#1E293B", outline="#475569")
    else:
        # Detail / closed lid with metal sheen and logo badge
        draw.rounded_rectangle([350, 450, 1250, 1150], radius=30, fill=chassis_color, outline="#64748B", width=6)
        draw.ellipse([720, 720, 880, 880], fill=colors[1])


def draw_clothing(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]
    fabric_color = colors[1] if shot == 1 else (colors[2] if shot == 2 else colors[0])

    draw_shadow(draw, [400, 1420, 1200, 1470])

    # Silhouette: Stylized jacket/shirt
    # Collar / Neck
    draw.polygon(
        [
            (800, 320),
            (950, 420),
            (1150, 560),
            (1050, 720),
            (980, 680),
            (990, 1380),
            (610, 1380),
            (620, 680),
            (550, 720),
            (450, 560),
            (650, 420),
        ],
        fill=fabric_color,
        outline="#1E293B",
    )
    # V-neck / lapel fold
    draw.polygon([(800, 420), (740, 650), (800, 850), (860, 650)], fill="#FFFFFF", outline="#334155")
    # Buttons
    for by in [920, 1040, 1160, 1280]:
        draw.ellipse([790, by, 810, by + 20], fill="#F8FAFC", outline="#334155", width=2)


def draw_book(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]
    cover_bg = colors[0] if shot != 2 else colors[2]
    accent = colors[1]

    draw_shadow(draw, [380, 1380, 1260, 1460])

    # Book spine & pages thickness (3D effect)
    draw.polygon([(420, 340), (460, 300), (1240, 300), (1200, 340)], fill="#F1F5F9", outline="#CBD5E1")
    draw.polygon([(1200, 340), (1240, 300), (1240, 1340), (1200, 1380)], fill="#E2E8F0", outline="#94A3B8")

    # Front cover
    draw.rounded_rectangle([420, 340, 1200, 1380], radius=16, fill=cover_bg, outline="#0F172A", width=4)
    # Cover artwork geometric layout
    draw.rectangle([460, 380, 1160, 440], fill=accent)
    draw.ellipse([650, 550, 970, 870], fill=accent)

    # Simplified typography shapes
    draw.rounded_rectangle([520, 980, 1100, 1020], radius=8, fill="#FFFFFF")
    draw.rounded_rectangle([580, 1050, 1040, 1080], radius=6, fill="#E2E8F0")
    draw.rounded_rectangle([660, 1180, 960, 1205], radius=6, fill=accent)


def draw_home_appliance(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]
    body_color = "#1E293B" if shot != 2 else "#334155"

    draw_shadow(draw, [420, 1400, 1180, 1460])

    # Air fryer / Cooker cylindrical / rounded body
    draw.rounded_rectangle([500, 380, 1100, 1400], radius=80, fill=body_color, outline="#64748B", width=6)
    # Shiny chrome top rim
    draw.rounded_rectangle([540, 400, 1060, 460], radius=20, fill="#E2E8F0", outline="#94A3B8")
    # Touch screen display
    draw.rounded_rectangle([620, 500, 980, 720], radius=30, fill="#020617")
    draw.text((750, 580), "200°C", fill=colors[1])
    # Handle & Basket separator
    draw.rounded_rectangle([530, 800, 1070, 1340], radius=40, fill="#0F172A", outline="#475569", width=4)
    draw.rounded_rectangle([750, 880, 850, 1220], radius=30, fill="#64748B", outline="#CBD5E1", width=4)


def draw_electronics(draw: ImageDraw.ImageDraw, title: str, shot: int, p_idx: int):
    colors = PALETTES[p_idx % len(PALETTES)]

    draw_shadow(draw, [400, 1420, 1200, 1470])

    if "Headphones" in title or "Buds" in title:
        # Headphone headband arch
        draw.arc([480, 280, 1120, 980], start=180, end=0, fill="#334155", width=50)
        # Cushioned pads on top
        draw.arc([520, 300, 1080, 940], start=200, end=340, fill=colors[0], width=40)
        # Left and right earcups
        for cx in [480, 1120]:
            draw.ellipse([cx - 90, 800, cx + 90, 1220], fill=colors[1] if shot == 2 else colors[0], outline="#64748B", width=6)
            draw.ellipse([cx - 65, 840, cx + 65, 1180], fill="#0F172A")
    elif "Watch" in title or "Band" in title:
        # Watch straps
        draw.rounded_rectangle([660, 220, 940, 1420], radius=40, fill="#334155")
        # Watch casing
        draw.rounded_rectangle([580, 540, 1020, 1080], radius=80, fill=colors[0], outline="#94A3B8", width=8)
        # Screen
        draw.rounded_rectangle([610, 570, 990, 1050], radius=60, fill="#020617")
        draw.ellipse([700, 710, 900, 910], fill=colors[1])
        # Crown button
        draw.rounded_rectangle([1020, 730, 1050, 850], radius=10, fill="#CBD5E1")
    elif "Speaker" in title:
        # Cylindrical speaker
        draw.rounded_rectangle([520, 420, 1080, 1340], radius=100, fill=colors[0], outline="#475569", width=6)
        # Grille texture lines
        for y in range(540, 1220, 30):
            draw.line([560, y, 1040, y], fill=colors[1], width=4)
        # Control ring
        draw.ellipse([720, 800, 880, 960], fill="#F8FAFC")
    else:
        # Modern tech hardware (SSD, Camera, Keyboard, Monitor)
        draw.rounded_rectangle([450, 480, 1150, 1220], radius=50, fill=colors[0], outline="#475569", width=6)
        draw.ellipse([680, 730, 920, 970], fill=colors[1])
        draw.rounded_rectangle([550, 1060, 1050, 1120], radius=10, fill="#F8FAFC")


def generate_single_image(idx: int, title: str, category: str, shot: int) -> bytes:
    canvas = Image.new("RGB", (1600, 1600), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    if category == "Smartphones":
        draw_smartphone(draw, title, shot, idx)
    elif category == "Laptops":
        draw_laptop(draw, title, shot, idx)
    elif "Clothing" in category:
        draw_clothing(draw, title, shot, idx)
    elif category == "Books":
        draw_book(draw, title, shot, idx)
    elif category == "Home & Kitchen":
        draw_home_appliance(draw, title, shot, idx)
    else:
        draw_electronics(draw, title, shot, idx)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_products = PRODUCT_TEMPLATES
    print(f"Generating seed images for {len(all_products)} products into {OUTPUT_DIR}...")

    total_images = 0
    total_bytes = 0

    for idx, (title, category) in enumerate(all_products):
        for shot in (1, 2, 3):
            raw_png = generate_single_image(idx, title, category, shot)
            processed = process_image(raw_png)
            variants = processed["variants"]

            # Save each variant: seed_{idx:03d}_{shot}_{w}.webp
            dims = [160, 480, 800, 1600]
            var_keys = ["thumb", "card", "detail", "zoom"]
            for w, k in zip(dims, var_keys):
                out_name = f"seed_{idx:03d}_{shot}_{w}.webp"
                data = variants[k]
                (OUTPUT_DIR / out_name).write_bytes(data)
                total_bytes += len(data)

            total_images += 1

    print(f"Done! Generated {total_images} shots ({total_images * 4} files total, {total_bytes / (1024*1024):.2f} MB).")


if __name__ == "__main__":
    main()
