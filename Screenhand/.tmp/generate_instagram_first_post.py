from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path('/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets')
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / 'screenhand-first-post-1080x1350.jpg'

W, H = 1080, 1350


def font(size, bold=False):
    candidates = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Supplemental/Helvetica.ttc',
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            pass
    return ImageFont.load_default()


img = Image.new('RGB', (W, H), (7, 18, 34))
d = ImageDraw.Draw(img)

# gradient background
c1 = (7, 18, 34)
c2 = (9, 68, 78)
c3 = (36, 114, 180)
for y in range(H):
    t = y / max(1, H - 1)
    if t < 0.5:
        tt = t / 0.5
        r = int(c1[0] + (c2[0] - c1[0]) * tt)
        g = int(c1[1] + (c2[1] - c1[1]) * tt)
        b = int(c1[2] + (c2[2] - c1[2]) * tt)
    else:
        tt = (t - 0.5) / 0.5
        r = int(c2[0] + (c3[0] - c2[0]) * tt)
        g = int(c2[1] + (c3[1] - c2[1]) * tt)
        b = int(c2[2] + (c3[2] - c2[2]) * tt)
    d.line([(0, y), (W, y)], fill=(r, g, b))

# decorative cards
card = (54, 72, W - 54, H - 72)
d.rounded_rectangle(card, radius=34, fill=(8, 19, 36), outline=(107, 206, 224), width=4)

# header
x = 94
y = 126
d.text((x, y), 'ScreenHand', font=font(84, bold=True), fill=(233, 248, 255))
d.text((x, y + 98), 'AI with Eyes + Hands on Desktop', font=font(42, bold=True), fill=(188, 236, 226))

# hook
d.rounded_rectangle((x, y + 186, W - 94, y + 306), radius=20, fill=(17, 39, 62), outline=(109, 191, 222), width=2)
d.text((x + 26, y + 218), 'From prompt -> real action in apps', font=font(40, bold=True), fill=(236, 250, 255))

# bullets
bullets = [
    'See screen with OCR + UI understanding',
    'Click, type, navigate any workflow',
    'Automate Chrome + native apps',
    'Build repeatable ops/playbooks with MCP'
]
by = y + 366
for i, b in enumerate(bullets):
    yy = by + i * 98
    d.rounded_rectangle((x, yy, W - 94, yy + 72), radius=16, fill=(16, 37, 59), outline=(94, 184, 215), width=2)
    d.text((x + 22, yy + 18), f'• {b}', font=font(34, bold=False), fill=(220, 244, 255))

# CTA footer
fy1 = H - 252
d.rounded_rectangle((x, fy1, W - 94, H - 112), radius=20, fill=(20, 47, 75), outline=(114, 207, 226), width=2)
d.text((x + 22, fy1 + 20), 'Open source on GitHub', font=font(36, bold=True), fill=(236, 250, 255))
d.text((x + 22, fy1 + 66), 'Search: manushi4/Screenhand', font=font(33), fill=(189, 233, 255))

img.save(OUT, format='JPEG', quality=93, optimize=True)
print(str(OUT))
