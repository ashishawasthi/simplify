"""Generate the QR share card + standalone QR poster for simplify.whiz.coach.

Offline: segno builds the matrix, Pillow draws. Run from the repo root.
"""
import os
import segno
from PIL import Image, ImageDraw, ImageFont

URL = "https://simplify.whiz.coach/"
URL_LABEL = "simplify.whiz.coach"
APP_NAME = "Simplify"          # the app; "Can I afford it?" is only its first page
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
    """1200x630 Open Graph / Twitter summary_large_image card.

    Everything is centred on purpose. WhatsApp — the main way this link gets
    shared — thumbnails a card by cropping the middle square (here x 285..915)
    and throws the rest away, so a QR sitting off to one side is exactly the
    part that disappears. Name, QR and URL therefore all live inside that
    middle square; the wide margins are only ever seen on the platforms that
    render the full 1.91:1 card.
    """
    W, H = 1200, 630
    safe_x0, safe_x1 = (W - H) // 2, (W + H) // 2   # the square WhatsApp keeps
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # Top accent bar in the app's theme colour.
    d.rectangle([0, 0, W, 12], fill=PRIMARY)

    cx = W // 2

    def centred(text, fnt, y, fill):
        d.text((cx - d.textlength(text, font=fnt) / 2, y), text, font=fnt, fill=fill)

    centred(APP_NAME, bold(46), 24, PRIMARY)

    # QR on a bordered white tile, sized as large as the square crop allows
    # once the name above and the URL below have their room.
    tile, tile_y = 450, 88
    tile_x = cx - tile // 2
    d.rounded_rectangle([tile_x, tile_y, tile_x + tile, tile_y + tile],
                        radius=24, fill=WHITE, outline=PRIMARY, width=4)
    qr_size = tile - 52
    qr = qr_image(URL, module_px=8, quiet=2).resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr, (tile_x + 26, tile_y + 26))

    # Readable URL, so a preview that is screenshotted or never scanned still
    # tells the reader where to go.
    centred(URL_LABEL, bold(32), tile_y + tile + 14, PRIMARY_DARK)

    assert safe_x0 <= tile_x and tile_x + tile <= safe_x1, "QR escapes the square crop"
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
