from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path('/Users/khushi/Documents/Automator/Screenhand/.tmp/devpost-assets')
OUT_DIR.mkdir(parents=True, exist_ok=True)

W_TH, H_TH = 1280, 720
W_G, H_G = 1500, 1000  # 3:2 ratio recommended for Devpost gallery


def get_font(size: int, bold: bool = False):
    candidates = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Supplemental/Helvetica.ttc',
        '/System/Library/Fonts/SFNS.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_gradient(img, c1=(8, 22, 44), c2=(17, 94, 89), c3=(35, 122, 201)):
    d = ImageDraw.Draw(img)
    w, h = img.size
    for y in range(h):
        t = y / max(1, h - 1)
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
        d.line([(0, y), (w, y)], fill=(r, g, b))


def rounded_rect(draw, xy, r, fill, outline=None, width=1):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=fill, outline=outline, width=width)


def save_jpg(img, path):
    img.save(path, format='JPEG', quality=92, optimize=True)


# Thumbnail
thumb = Image.new('RGB', (W_TH, H_TH), (10, 20, 40))
draw_gradient(thumb)
d = ImageDraw.Draw(thumb)

# Decorative panels
rounded_rect(d, (70, 90, 730, 630), 24, fill=(8, 16, 30), outline=(92, 189, 214), width=3)
rounded_rect(d, (760, 110, 1210, 300), 20, fill=(18, 36, 62), outline=(112, 210, 184), width=2)
rounded_rect(d, (760, 340, 1210, 610), 20, fill=(12, 28, 52), outline=(106, 173, 255), width=2)

f_title = get_font(70, bold=True)
f_sub = get_font(33, bold=False)
f_small = get_font(27, bold=False)

# Text
x, y = 110, 130
d.text((x, y), 'ScreenHand', font=f_title, fill=(234, 248, 255))
d.text((x, y + 100), 'AI Agent Desktop Automation via MCP', font=f_sub, fill=(186, 237, 227))
d.text((x, y + 165), 'See • Click • Type • Automate', font=f_small, fill=(182, 209, 255))

d.text((790, 140), 'Cross-App Control', font=get_font(34, True), fill=(225, 247, 240))
d.text((790, 190), 'Native Apps + Browser', font=get_font(28), fill=(189, 227, 255))
d.text((790, 370), 'macOS + Windows', font=get_font(34, True), fill=(231, 247, 255))
d.text((790, 420), 'Accessibility • OCR • CDP', font=get_font(28), fill=(188, 230, 226))

thumb_path = OUT_DIR / 'screenhand-thumbnail-seo.jpg'
save_jpg(thumb, thumb_path)


# Gallery 1: Architecture
g1 = Image.new('RGB', (W_G, H_G), (12, 20, 36))
draw_gradient(g1, (10, 20, 36), (14, 72, 86), (34, 115, 170))
d1 = ImageDraw.Draw(g1)

rounded_rect(d1, (80, 110, 1420, 900), 30, fill=(8, 18, 34), outline=(99, 196, 213), width=3)

f_h = get_font(58, True)
f_m = get_font(30)

# Boxes + arrows
boxes = [
    (130, 280, 470, 430, 'AI Client\n(Claude/Codex/Cursor)'),
    (580, 280, 920, 430, 'ScreenHand MCP\n(TypeScript Runtime)'),
    (1030, 280, 1370, 430, 'Native Bridge\n(Swift / .NET)'),
]
for (x1, y1, x2, y2, txt) in boxes:
    rounded_rect(d1, (x1, y1, x2, y2), 22, fill=(16, 38, 62), outline=(121, 210, 223), width=2)
    d1.multiline_text((x1 + 24, y1 + 34), txt, font=get_font(29, True), fill=(233, 247, 255), spacing=8)

# arrows
for x in [485, 935]:
    d1.line([(x, 355), (x + 80, 355)], fill=(169, 230, 221), width=7)
    d1.polygon([(x + 80, 355), (x + 62, 343), (x + 62, 367)], fill=(169, 230, 221))

# footer bullets
d1.text((120, 140), 'Architecture Overview', font=f_h, fill=(236, 250, 255))
d1.text((120, 200), 'One MCP tool layer for native apps + browser automation', font=f_m, fill=(189, 227, 255))
d1.text((120, 500), '• Accessibility/UI Automation  • OCR  • CDP  • AppleScript', font=get_font(33), fill=(189, 237, 221))
d1.text((120, 560), '• Real workflows: QA, onboarding, ops automation', font=get_font(33), fill=(189, 237, 221))

g1_path = OUT_DIR / 'screenhand-gallery-01-architecture.jpg'
save_jpg(g1, g1_path)


# Gallery 2: Workflow
g2 = Image.new('RGB', (W_G, H_G), (10, 26, 45))
draw_gradient(g2, (10, 26, 45), (15, 79, 93), (49, 126, 195))
d2 = ImageDraw.Draw(g2)

rounded_rect(d2, (70, 100, 1430, 900), 28, fill=(9, 20, 37), outline=(93, 186, 214), width=3)
d2.text((110, 130), 'End-to-End Workflow', font=get_font(58, True), fill=(238, 250, 255))
d2.text((110, 200), 'From prompt to completed desktop task', font=get_font(31), fill=(189, 227, 255))

steps = [
    '1) Agent reads screen + UI tree',
    '2) Plans actions across apps/tabs',
    '3) Clicks/types/navigates with guardrails',
    '4) Verifies result + saves reusable pattern',
]
for i, s in enumerate(steps):
    y = 300 + i * 135
    rounded_rect(d2, (120, y, 1380, y + 95), 18, fill=(18, 42, 68), outline=(117, 210, 224), width=2)
    d2.text((155, y + 28), s, font=get_font(34, True), fill=(234, 248, 255))

g2_path = OUT_DIR / 'screenhand-gallery-02-workflow.jpg'
save_jpg(g2, g2_path)


# Gallery 3: Use Cases
g3 = Image.new('RGB', (W_G, H_G), (8, 22, 41))
draw_gradient(g3, (8, 22, 41), (12, 69, 83), (37, 113, 180))
d3 = ImageDraw.Draw(g3)

rounded_rect(d3, (70, 100, 1430, 900), 28, fill=(8, 19, 36), outline=(92, 183, 216), width=3)
d3.text((110, 130), 'High-Impact Use Cases', font=get_font(58, True), fill=(238, 250, 255))
d3.text((110, 200), 'Where ScreenHand delivers immediate value', font=get_font(31), fill=(189, 227, 255))

cards = [
    (120, 290, 440, 520, 'UI Testing', 'Click flows\nValidate text\nCatch regressions'),
    (490, 290, 810, 520, 'Growth Ops', 'Cross-app tasks\nData handoff\nAutomated workflows'),
    (860, 290, 1180, 520, 'Support Ops', 'Reproduce issues\nRun diagnostics\nStandardize steps'),
    (1230, 290, 1410, 520, 'QA', 'Browser +\nNative app\nverification'),
]
for x1, y1, x2, y2, title, body in cards:
    rounded_rect(d3, (x1, y1, x2, y2), 18, fill=(17, 40, 65), outline=(117, 209, 223), width=2)
    d3.text((x1 + 18, y1 + 18), title, font=get_font(31, True), fill=(236, 250, 255))
    d3.multiline_text((x1 + 18, y1 + 70), body, font=get_font(25), fill=(192, 232, 224), spacing=6)

# Big CTA band
rounded_rect(d3, (120, 590, 1380, 840), 20, fill=(20, 47, 76), outline=(116, 207, 226), width=2)
d3.text((160, 635), 'Result: reliable AI agent execution on real desktop software', font=get_font(39, True), fill=(234, 248, 255))
d3.text((160, 695), 'MCP-based control • Cross-platform • Production-focused', font=get_font(30), fill=(187, 230, 255))

g3_path = OUT_DIR / 'screenhand-gallery-03-use-cases.jpg'
save_jpg(g3, g3_path)

print(str(thumb_path))
print(str(g1_path))
print(str(g2_path))
print(str(g3_path))
