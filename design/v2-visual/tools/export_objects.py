"""Optimised exports of the Blender render masters: WebP with real alpha at the sizes the product uses.
python3 export_objects.py <renders_dir> <exports_dir> <report.json>
- Alpha: renders are straight-alpha PNG from Cycles (film transparent + shadow catcher). Resizing is done in premultiplied
  space (Pillow RGBa) so no dark/bright fringe appears on the edges; fully transparent pixels get RGB 0.
- Sizes: 512 (hero, vitrine on wide screens), 256 (default, 2x of 128 CSS px), 128 (rows, 2x of 64), 64 (32 px chips at 2x).
- Quality 82 for 256/512, 88 for the small sizes (edges matter more), method 6."""
import sys, os, json, hashlib
from PIL import Image
src, dst, rep = sys.argv[1], sys.argv[2], sys.argv[3]
import numpy as np

def fade_shadow(im):
    """The shadow catcher writes a faint black shadow that can reach the frame edge, which shows as a square on a lighter
    panel. Shadow pixels (black, partial alpha) are faded with an elliptical falloff (full inside 34 % of the size, zero at
    48 %); the object's own pixels are never touched."""
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h * 0.55) / h) ** 2)
    fall = np.clip((0.48 - r) / (0.48 - 0.34), 0, 1)
    fall = fall * fall * (3 - 2 * fall)
    shadow = (a[..., :3].max(axis=2) < 12) & (a[..., 3] < 250)
    a[..., 3] = np.where(shadow, a[..., 3] * fall, a[..., 3])
    edge = np.zeros((h, w), bool); edge[:2, :] = edge[-2:, :] = edge[:, :2] = edge[:, -2:] = True
    a[..., 3] = np.where(edge & shadow, 0, a[..., 3])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')
os.makedirs(dst, exist_ok=True)
os.makedirs(os.path.join(dst, '..', 'masters-png'), exist_ok=True)
out = []
for f in sorted(os.listdir(src)):
    if not f.endswith('-512.png') and not f.endswith('-1024.png'):
        continue
    oid = f.rsplit('-', 1)[0]
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    im = fade_shadow(im)
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    rec = {'id': oid, 'master': f, 'master_sha256': hashlib.sha256(open(os.path.join(src, f), 'rb').read()).hexdigest(),
           'master_px': im.size[0], 'alpha_bbox': bbox, 'exports': []}
    pm = im.convert('RGBa')
    sizes = [1024, 512, 256, 128, 64] if im.size[0] >= 1024 else [512, 256, 128, 64]
    for s in sizes:
        r = pm.resize((s, s), Image.LANCZOS).convert('RGBA') if s != im.size[0] else im
        px = r.load()
        q = 82 if s >= 256 else 88
        p = os.path.join(dst, f'{oid}-{s}.webp')
        r.save(p, 'WEBP', quality=q, method=6, alpha_quality=90, exact=False)
        b = os.path.getsize(p)
        rec['exports'].append({'file': os.path.basename(p), 'px': s, 'bytes': b, 'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest()})
    corners = [im.getpixel((0, 0))[3], im.getpixel((im.size[0] - 1, 0))[3], im.getpixel((0, im.size[1] // 2))[3], im.getpixel((im.size[0] - 1, im.size[1] - 1))[3]]
    im.save(os.path.join(dst, '..', 'masters-png', f), optimize=True)
    rec['corner_alpha'] = corners
    out.append(rec)
json.dump(out, open(rep, 'w'), indent=1)
tot = sum(e['bytes'] for r in out for e in r['exports'])
print(len(out), 'objects', tot, 'bytes total')
for r in out:
    print(r['id'], ' '.join(f"{e['px']}:{e['bytes']//1024}K" for e in r['exports']))
