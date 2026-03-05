from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out_dir = Path('/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram-assets')
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / 'screenhand-profile-1080.png'

W = H = 1080
img = Image.new('RGB', (W, H), (9, 22, 42))
d = ImageDraw.Draw(img)

# Gradient background
c1 = (9, 22, 42)
c2 = (11, 88, 101)
c3 = (40, 126, 195)
for y in range(H):
    t = y / (H - 1)
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

# Main circle
cx, cy = W // 2, H // 2
radius = 380
d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(7, 18, 34), outline=(112, 210, 228), width=14)

# Inner accent
r2 = 300
d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), outline=(84, 170, 245), width=8)

# Fonts
font_candidates_bold = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Helvetica.ttc'
]
font_candidates_reg = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Helvetica.ttc'
]

def pick_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

f_big = pick_font(font_candidates_bold, 260)
f_small = pick_font(font_candidates_reg, 64)

# Text
main = 'SH'
bbox = d.textbbox((0, 0), main, font=f_big)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text((cx - tw // 2, cy - th // 2 - 32), main, font=f_big, fill=(233, 248, 255))

sub = 'ScreenHand'
sb = d.textbbox((0, 0), sub, font=f_small)
sw = sb[2] - sb[0]
d.text((cx - sw // 2, cy + 170), sub, font=f_small, fill=(182, 232, 220))

img.save(out, format='PNG', optimize=True)
print(str(out))
