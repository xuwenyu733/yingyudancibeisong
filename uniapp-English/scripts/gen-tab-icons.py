"""Generate clear mint tab icons + versioned filenames to bust HBuilder cache."""
from pathlib import Path

from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "src" / "static" / "tab"
out.mkdir(parents=True, exist_ok=True)
SIZE = 96
PAD = 10

OFF = (138, 148, 166, 255)  # #8A94A6
ON = (46, 176, 134, 255)  # #2EB086
VERSION = "v2"


def canvas():
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def save(img: Image.Image, name: str) -> None:
    path = out / name
    img.save(path, "PNG")
    print("wrote", path.name, path.stat().st_size, "bytes")


def draw_home(color):
    """Adventure mountain + flag — 今日冒险"""
    im = canvas()
    d = ImageDraw.Draw(im)
    d.polygon([(14, 78), (38, 28), (48, 46), (60, 20), (82, 78)], fill=color)
    d.line([(60, 20), (60, 8)], fill=color, width=4)
    d.polygon([(60, 8), (78, 16), (60, 22)], fill=color)
    return im


def draw_book(color):
    """Open book — 单词地图"""
    im = canvas()
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((12, 18, 46, 78), radius=6, outline=color, width=5)
    d.rounded_rectangle((50, 18, 84, 78), radius=6, outline=color, width=5)
    d.line([(48, 20), (48, 76)], fill=color, width=4)
    for y in (34, 48, 62):
        d.line([(22, y), (38, y)], fill=color, width=4)
        d.line([(58, y), (74, y)], fill=color, width=4)
    return im


def draw_wrong(color):
    """Review refresh + check — 复习小站"""
    im = canvas()
    d = ImageDraw.Draw(im)
    d.arc((16, 16, 80, 80), start=35, end=260, fill=color, width=6)
    d.polygon([(68, 14), (86, 24), (66, 34)], fill=color)
    d.line([(32, 50), (44, 62), (66, 36)], fill=color, width=6)
    return im


def draw_pet(color):
    """Fox head — 我的伙伴"""
    im = canvas()
    d = ImageDraw.Draw(im)
    d.ellipse((18, 30, 78, 82), fill=color)
    d.polygon([(22, 40), (30, 10), (44, 34)], fill=color)
    d.polygon([(74, 40), (66, 10), (52, 34)], fill=color)
    d.ellipse((34, 48, 62, 74), fill=(255, 255, 255, 235))
    d.ellipse((32, 42, 42, 52), fill=(255, 255, 255, 255))
    d.ellipse((54, 42, 64, 52), fill=(255, 255, 255, 255))
    d.ellipse((44, 54, 52, 62), fill=color)
    return im


def draw_parent(color):
    """Shield + person — 家长中心"""
    im = canvas()
    d = ImageDraw.Draw(im)
    d.polygon(
        [(48, 8), (82, 22), (82, 50), (48, 88), (14, 50), (14, 22)],
        outline=color,
        width=5,
    )
    d.ellipse((36, 28, 60, 52), outline=color, width=4)
    d.arc((26, 50, 70, 82), start=200, end=340, fill=color, width=4)
    return im


pairs = [
    ("home", draw_home),
    ("book", draw_book),
    ("wrong", draw_wrong),
    ("pet", draw_pet),
    ("parent", draw_parent),
]

for name, fn in pairs:
    # Keep legacy names overwritten + versioned names for cache bust
    save(fn(OFF), f"{name}.png")
    save(fn(ON), f"{name}-on.png")
    save(fn(OFF), f"{name}-{VERSION}.png")
    save(fn(ON), f"{name}-{VERSION}-on.png")

print("done")
