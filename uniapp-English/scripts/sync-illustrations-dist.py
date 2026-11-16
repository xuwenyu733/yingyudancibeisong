from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "static" / "illustrations"
TARGETS = [
    ROOT / "dist" / "dev" / "app-plus" / "static" / "illustrations",
    ROOT / "dist" / "build" / "app" / "static" / "illustrations",
    ROOT.parents[0] / "frontend-English" / "public" / "illustrations",
]
FILES = [
    "parent-tip.png",
    "xiaoyu-avatar.png",
    "fox.png",
    "wrong-review.png",
    "parent-center.png",
    "home-primary.png",
    "home-junior.png",
    "login-hero.png",
    "child-create.png",
    "study-play.png",
    "study-card.png",
    "library-map.png",
]

for target in TARGETS:
    target.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        src = SRC / name
        if src.exists():
            shutil.copy2(src, target / name)

# sync whole build/app -> app-plus if both exist
build = ROOT / "dist" / "build" / "app"
dev = ROOT / "dist" / "dev" / "app-plus"
if build.exists() and (build / "app-service.js").exists():
    for path in build.rglob("*"):
        if path.is_file():
            rel = path.relative_to(build)
            out = dev / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, out)
    # restore illustrations after copy
    for name in FILES:
        src = SRC / name
        if src.exists():
            shutil.copy2(src, dev / "static" / "illustrations" / name)
            shutil.copy2(src, build / "static" / "illustrations" / name)

pat = re.compile(r"/static/illustrations/([a-z0-9_-]+\.png)(?:\?v=[^\"]*)?")
for js in [dev / "app-service.js", build / "app-service.js"]:
    if not js.exists():
        continue
    text = js.read_text(encoding="utf-8")
    text2 = pat.sub(r"/static/illustrations/\1?v=20261110w2", text)
    js.write_text(text2, encoding="utf-8")
    print("patched", js.name)

print("parent-tip exists", (dev / "static" / "illustrations" / "parent-tip.png").exists())
