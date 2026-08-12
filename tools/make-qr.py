"""Generate the QR share card + standalone QR poster for simplify.whiz.coach.

Offline: segno builds the matrix, Pillow draws. Run from the repo root.
"""
import os
import segno
from PIL import Image, ImageDraw, ImageFont

URL = "https://simplify.whiz.coach/"
URL_LABEL = "simplify.whiz.coach"
TITLE = "Can I afford it?"
TAGLINE = "Check if you have enough money to buy what you want."

PRIMARY = "#1565c0"
PRIMARY_DARK = "#0d47a1"
TEXT = "#1a1a1a"
MUTED = "#444444"
WHITE = "#ffffff"

FONT_DIRS = ["/System/Library/Fonts/Supplemental/", "/System/Library/Fonts/"]
BOLD_NAMES = ["Arial Bold.ttf", "Arial Black.ttf", "Helvetica.ttc"]
REG_NAMES = ["Arial.ttf", "Helvetica.ttc", "SFNS.ttf"]


def font(names, size):
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def bold(size):
    return font(BOLD_NAMES, size)


def regular(size):
    return font(REG_NAMES, size)


def qr_image(url, module_px, quiet=4, dark=(0, 0, 0)):
    """Render the QR as a crisp PIL image, one matrix cell -> module_px square."""
    qr = segno.make(url, error="h")
    matrix = [list(row) for row in qr.matrix]
    n = len(matrix)
    size = (n + quiet * 2) * module_px
    img = Image.new("RGB", (size, size), WHITE)
    d = ImageDraw.Draw(img)
    for y, row in enumerate(matrix):
        for x, cell in enumerate(row):
            if cell:
                x0 = (x + quiet) * module_px
                y0 = (y + quiet) * module_px
                d.rectangle([x0, y0, x0 + module_px - 1, y0 + module_px - 1], fill=dark)
    return img


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def make_og_card(path):
    """1200x630 Open Graph / Twitter summary_large_image card."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # Top accent bar in the app's theme colour.
    d.rectangle([0, 0, W, 14], fill=PRIMARY)

    # --- Right: QR on a bordered white tile ---
    tile = 420
    tile_x, tile_y = W - tile - 70, (H - tile) // 2 + 7
    d.rounded_rectangle([tile_x, tile_y, tile_x + tile, tile_y + tile],
                        radius=24, fill=WHITE, outline=PRIMARY, width=4)
    qr = qr_image(URL, module_px=8, quiet=2)
    qr_size = tile - 56
    qr = qr.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr, (tile_x + 28, tile_y + 28))

    cap = bold(24)
    cap_text = "Scan to open"
    d.text((tile_x + (tile - d.textlength(cap_text, font=cap)) / 2, tile_y + tile + 20),
           cap_text, font=cap, fill=MUTED)

    # --- Left: title, tagline, URL ---
    x = 70
    y = 150
    t = bold(76)
    d.text((x, y), TITLE, font=t, fill=PRIMARY)
    y += 100

    tag = regular(32)
    for line in wrap(d, TAGLINE, tag, tile_x - x - 60):
        d.text((x, y), line, font=tag, fill=MUTED)
        y += 44

    y += 34
    u = bold(38)
    url_w = d.textlength(URL_LABEL, font=u)
    d.rounded_rectangle([x - 18, y - 14, x + url_w + 18, y + 54],
                        radius=12, fill="#e8f0fe")
    d.text((x, y), URL_LABEL, font=u, fill=PRIMARY_DARK)

    img.save(path, "PNG", optimize=True)
    return img.size


def make_poster(path):
    """Standalone QR with the URL printed beneath — for posters/handouts."""
    W, H = 1000, 1240
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 16], fill=PRIMARY)

    t = bold(64)
    d.text(((W - d.textlength(TITLE, font=t)) / 2, 80), TITLE, font=t, fill=PRIMARY)

    tag = regular(30)
    y = 176
    for line in wrap(d, TAGLINE, tag, W - 160):
        d.text(((W - d.textlength(line, font=tag)) / 2, y), line, font=tag, fill=MUTED)
        y += 42

    qr_size = 620
    qr = qr_image(URL, module_px=10, quiet=2).resize((qr_size, qr_size), Image.NEAREST)
    qx, qy = (W - qr_size) // 2, y + 50
    d.rounded_rectangle([qx - 26, qy - 26, qx + qr_size + 26, qy + qr_size + 26],
                        radius=24, fill=WHITE, outline=PRIMARY, width=5)
    img.paste(qr, (qx, qy))

    u = bold(44)
    d.text(((W - d.textlength(URL_LABEL, font=u)) / 2, qy + qr_size + 62),
           URL_LABEL, font=u, fill=PRIMARY_DARK)

    img.save(path, "PNG", optimize=True)
    return img.size


if __name__ == "__main__":
    out = "public/img"
    os.makedirs(out, exist_ok=True)
    print("og-card.png ", make_og_card(f"{out}/og-card.png"))
    print("qr-poster.png", make_poster(f"{out}/qr-poster.png"))
