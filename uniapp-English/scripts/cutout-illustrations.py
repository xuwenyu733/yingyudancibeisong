"""Replace soft page/sky wash with solid white so assets blend into white cards."""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "src" / "static" / "illustrations"
WEB = Path(__file__).resolve().parents[2] / "frontend-English" / "public" / "illustrations"
FILES = ["home-primary.png", "home-junior.png", "wrong-review.png"]
WHITE = (255, 255, 255, 255)


def is_wash(r: int, g: int, b: int, a: int) -> bool:
    if a < 20:
        return True
    # cream / pale yellow page
    if r >= 235 and g >= 225 and b >= 200 and (r + g + b) >= 680:
        return True
    # soft yellow tint
    if r >= 245 and g >= 235 and b >= 210 and (r - b) >= 10:
        return True
    # pale blue / mint sky wash (low saturation lights)
    if r >= 200 and g >= 210 and b >= 210 and (r + g + b) >= 650:
        mx, mn = max(r, g, b), min(r, g, b)
        if (mx - mn) <= 45:
            return True
    # soft beige
    mx, mn = max(r, g, b), min(r, g, b)
    if (r + g + b) >= 660 and (mx - mn) <= 40 and r >= 220:
        return True
    return False


def whiten_bg(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[x][y]:
            continue
        visited[x][y] = True
        r, g, b, a = px[x, y]
        if not is_wash(r, g, b, a):
            continue
        px[x, y] = WHITE
        q.append((x - 1, y))
        q.append((x + 1, y))
        q.append((x, y - 1))
        q.append((x, y + 1))

    # single edge expand into wash next to white
    to_white: list[tuple[int, int]] = []
    for x in range(1, w - 1):
        for y in range(1, h - 1):
            r, g, b, a = px[x, y]
            if px[x, y] == WHITE or not is_wash(r, g, b, a):
                continue
            if (
                px[x - 1, y] == WHITE
                or px[x + 1, y] == WHITE
                or px[x, y - 1] == WHITE
                or px[x, y + 1] == WHITE
            ):
                to_white.append((x, y))
    for x, y in to_white:
        px[x, y] = WHITE

    return img.convert("RGB")


def main() -> None:
    WEB.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        bak = ROOT / name.replace(".png", ".orig.png")
        cur = ROOT / name
        if not bak.exists() and cur.exists():
            Image.open(cur).convert("RGBA").save(bak)
        src = bak if bak.exists() else cur
        if not src.exists():
            print("missing", src)
            continue
        out = whiten_bg(src)
        out.save(ROOT / name, optimize=True)
        out.save(WEB / name, optimize=True)
        print("ok", name, out.size, out.mode)


if __name__ == "__main__":
    main()
