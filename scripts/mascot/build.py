"""
Builds every mascot asset the site uses from the logo artwork.

    python3 scripts/mascot/build.py          (needs Pillow with WebP support)
    python3 scripts/mascot/build.py --icons  (only the icons, from public/brand/mascot.webp)

Inputs
  assets/brand/logo-source.jpg   the logo as supplied (1067 x 1067)
  scripts/mascot/sketch.py       hand-placed contour strokes for the sketch stage

Outputs
  public/intro/{hair,face,earring,hat}.webp   the painting cut into layers (transparent)
  public/brand/mascot.webp                    the mascot on the logo's own ground, for covers
  src/app/icon.png, apple-icon.png, favicon.ico   browser, search and home-screen icons (the whole mascot)
  src/components/brand/mascot-data.ts         layer positions and sketch paths (generated)

When a designer redraws the mascot as layered vector art, replace this
pipeline with their files and keep mascot-data.ts's shape.
"""
import io
import json
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from sketch import STROKES, smooth  # noqa: E402

SOURCE = os.path.join(ROOT, "assets/brand/logo-source.jpg")
CROP = (285, 185, 735, 662)  # mascot only: no ring, no wordmark. Gives a 450 x 477 canvas.
BG = (238, 227, 209)  # the logo's ground inside the ring
W, H = CROP[2] - CROP[0], CROP[3] - CROP[1]


def is_bg(p):
    return math.dist(p[:3], BG) < 20


def polygon_mask(points):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m


# Regions, in canvas coordinates. The hat outline was traced by hand.
HAT = [
    (8, 293), (30, 281), (40, 274), (60, 262), (80, 247), (100, 232), (110, 225), (121, 214),
    (122, 180), (126, 140), (132, 118), (142, 100), (152, 88), (162, 78), (176, 66), (194, 57), (212, 49), (232, 43), (250, 43), (262, 50), (278, 62), (290, 74),
    (300, 76), (320, 62), (340, 51), (360, 40), (380, 30), (400, 21), (420, 14), (434, 11), (446, 13), (449, 22),
    (440, 34), (420, 61), (400, 88), (380, 115), (364, 137), (353, 150),
    (342, 149), (326, 148), (310, 146),
    (298, 141), (270, 165), (240, 191), (210, 217), (180, 243), (150, 263), (120, 283), (90, 290), (50, 295), (10, 299),
]
BRIM_FRONT = [(326, 150), (310, 148), (298, 143), (270, 165), (240, 191), (210, 217), (180, 243), (150, 263), (120, 283), (90, 290), (50, 295), (10, 299)]
FACE = [(296, 143), (310, 148), (326, 150), (342, 151), (356, 152), (380, 150), (392, 175), (388, 248), (342, 254), (322, 284), (302, 332), (298, 362), (284, 362), (282, 252), (292, 190), (296, 150)]
EARRING_BOX = (246, 203, 280, 262)
EARRING_PIVOT = (262, 207)  # top of the hook: the earring swings from here


def build_layers(crop):
    px = crop.load()
    hat = polygon_mask(HAT)
    # Grow the hat 5px to catch its painted outline, but never into the hair under the brim.
    grown = hat.filter(ImageFilter.MaxFilter(11))
    below = polygon_mask([(353, 152), (342, 151)] + BRIM_FRONT + [(0, H), (W, H), (W, 160)])
    hat = ImageChops.lighter(hat, ImageChops.subtract(grown, below))
    face = polygon_mask(FACE)
    ear = Image.new("L", (W, H), 0)
    ImageDraw.Draw(ear).ellipse(EARRING_BOX, fill=255)

    hp, fp, ep = hat.load(), face.load(), ear.load()
    layers = {k: Image.new("RGBA", (W, H), (0, 0, 0, 0)) for k in ("hair", "face", "earring", "hat")}
    lp = {k: v.load() for k, v in layers.items()}
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if is_bg(p):
                continue
            k = "hat" if hp[x, y] else "earring" if ep[x, y] else "face" if fp[x, y] else "hair"
            lp[k][x, y] = (*p, 255)

    # The earring swings a little during the intro, so paint hair behind its
    # left side (where the hair falls): carry the colour from the earring's
    # left edge across each row. The right side sits against the jaw and stays clear.
    hair = lp["hair"]
    x0, y0, x1, y1 = EARRING_BOX
    stop = x0 + int((x1 - x0) * 0.55)
    for y in range(y0, y1 + 1):
        fill = px[x0 - 2, y]
        if is_bg(fill):
            continue
        for x in range(x0, stop + 1):
            if ep[x, y] and hair[x, y][3] == 0:
                hair[x, y] = (*fill, 255)
    return layers


def webp_bytes(img, quality=82):
    b = io.BytesIO()
    img.save(b, "WEBP", quality=quality, method=6, alpha_quality=90)
    return b.getvalue()


def write(path, data):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(data)
    print(f"  {path}  {len(data) / 1024:.1f} KB")


def mascot_icon(mascot, size):
    """The whole mascot in the logo's circle: her ground inside a burgundy ring, hat and face centred."""
    s = 1024
    ring = 44
    inner = s - 2 * (8 + ring)
    # Wide enough that the hat's brim reaches the ring; her hair runs off the bottom of the circle.
    scale = inner * 1.02 / mascot.width
    art = mascot.convert("RGBA").resize((round(mascot.width * scale), round(mascot.height * scale)), Image.LANCZOS)
    disc = Image.new("RGBA", (s, s), BG + (255,))
    disc.alpha_composite(art, ((s - art.width) // 2, (s - art.height) // 2 + 40))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((8, 8, s - 8, s - 8), fill=255)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(disc, (0, 0), mask)
    ImageDraw.Draw(canvas).ellipse((8, 8, s - 8, s - 8), outline=(91, 20, 30, 255), width=ring)
    return canvas.resize((size, size), Image.LANCZOS)


def write_icons(mascot):
    b = io.BytesIO(); mascot_icon(mascot, 256).save(b, "PNG", optimize=True); write("src/app/icon.png", b.getvalue())
    # Home screens round the corners themselves: a full square in her ground.
    apple = Image.new("RGBA", (180, 180), BG + (255,))
    apple.alpha_composite(mascot_icon(mascot, 180))
    b = io.BytesIO(); apple.convert("RGB").save(b, "PNG", optimize=True); write("src/app/apple-icon.png", b.getvalue())
    b = io.BytesIO(); mascot_icon(mascot, 256).save(b, "ICO", sizes=[(16, 16), (32, 32), (48, 48)]); write("src/app/favicon.ico", b.getvalue())


def main():
    src = Image.open(SOURCE).convert("RGB")
    crop = src.crop(CROP)
    layers = build_layers(crop)

    print("Writing assets:")
    parts = {}
    for name in ("hair", "face", "earring", "hat"):
        img = layers[name]
        box = img.getbbox()
        write(f"public/intro/{name}.webp", webp_bytes(img.crop(box)))
        parts[name] = {"x": box[0], "y": box[1], "width": box[2] - box[0], "height": box[3] - box[1], "href": f"/intro/{name}.webp"}

    write("public/brand/mascot.webp", webp_bytes(crop, 84))

    write_icons(crop)

    sketch = {k: smooth(v) for k, v in STROKES.items()}
    ts = (
        "// GENERATED by scripts/mascot/build.py. Do not edit by hand.\n"
        "// Canvas: the mascot cropped from the logo, 450 x 477 units.\n\n"
        f"export const MASCOT_VIEWBOX = {{ width: {W}, height: {H} }} as const;\n\n"
        f"export const MASCOT_GROUND = \"#{BG[0]:02x}{BG[1]:02x}{BG[2]:02x}\";\n\n"
        f"export const EARRING_PIVOT = {{ x: {EARRING_PIVOT[0]}, y: {EARRING_PIVOT[1]} }} as const;\n\n"
        "/** The painting cut into layers, bottom to top. */\n"
        f"export const MASCOT_PARTS = {json.dumps(parts, indent=2)} as const;\n\n"
        "/** Contour strokes for the sketch stage, keyed by what they draw. */\n"
        f"export const SKETCH_PATHS = {json.dumps(sketch, indent=2)} as const;\n"
    )
    write("src/components/brand/mascot-data.ts", ts.encode())


if __name__ == "__main__":
    if "--icons" in sys.argv:
        print("Writing icons:")
        write_icons(Image.open(os.path.join(ROOT, "public/brand/mascot.webp")).convert("RGB"))
    else:
        main()
