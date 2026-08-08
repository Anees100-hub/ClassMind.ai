"""Build an animated ClassMind overview GIF/MP4 from storyboard frames."""
from pathlib import Path

from PIL import Image

demo = Path(__file__).resolve().parent
frames_files = [
    "hero.png",
    "frame01-roles.png",
    "frame02-lecture.png",
    "frame03-face.png",
    "frame04-emotion.png",
    "frame05-materials.png",
    "frame06-finale.png",
]
size = (960, 540)
images = []
for name in frames_files:
    im = Image.open(demo / name).convert("RGB")
    im = im.resize(size, Image.Resampling.LANCZOS)
    images.append(im)

durations = [2200, 2800, 2800, 2800, 2800, 2800, 3200]
out_gif = demo / "classmind-overview.gif"
images[0].save(
    out_gif,
    save_all=True,
    append_images=images[1:],
    duration=durations,
    loop=0,
    optimize=True,
    disposal=2,
)
print("GIF written:", out_gif, "size_mb=", round(out_gif.stat().st_size / 1e6, 2))

try:
    import numpy as np
    import imageio.v2 as imageio

    out_mp4 = demo / "classmind-overview.mp4"
    writer = imageio.get_writer(str(out_mp4), fps=1, codec="libx264", quality=8)
    repeats = [2, 3, 3, 3, 3, 3, 3]
    for im, r in zip(images, repeats):
        arr = np.array(im)
        for _ in range(r):
            writer.append_data(arr)
    writer.close()
    print("MP4 written:", out_mp4, "size_mb=", round(out_mp4.stat().st_size / 1e6, 2))
except Exception as e:
    print("MP4 skipped:", type(e).__name__, e)
