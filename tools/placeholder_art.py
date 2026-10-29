"""佔位用像素圖（0.7 換正式美術前用）。

輸出 320x180 的原尺寸圖到 public/art/，遊戲裡放大 4 倍。
所有圖層都用同一個座標系（左上角 0,0），所以在遊戲裡直接疊在 (0,0) 就對齊。
執行：python tools/placeholder_art.py（需要 Pillow）
"""
from pathlib import Path
import random

from PIL import Image, ImageDraw

W, H = 320, 180
OL = '#2A1B10'
OUT = Path(__file__).resolve().parent.parent / 'public' / 'art'
random.seed(7)

img = None
d = None


def canvas():
    global img, d
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)


def save(name, box=None):
    out = img.crop(box) if box else img
    out.save(OUT / name)


def R(x0, y0, x1, y1, c):
    if x1 > x0 and y1 > y0:
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


def P(x, y, c):
    d.point((x, y), fill=c)


def E(cx, cy, rx, ry, c, o=None, dd=None):
    (dd or d).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=c, outline=o)


def overlay(draw_fn):
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(lay))
    img.alpha_composite(lay)


def raw_sticker(x, y, w, h, chive=False):
    body, pleat, shadow = ('#E4E8C4', '#BCC58E', '#808A58') if chive else ('#F3E7CD', '#D6C29C', '#9C8862')
    R(x + 2, y, x + w - 2, y + 1, pleat)
    R(x + 1, y + 1, x + w - 1, y + h - 1, body)
    R(x, y + 2, x + w, y + h - 2, body)
    R(x + 1, y + h - 1, x + w - 1, y + h, shadow)


# ---------------- 背景：街景、櫃台、工作台、空鍋、生餃盤、水壺、空的保溫台 ----------------
def background():
    canvas()
    R(0, 0, W, 40, '#EDE3CE')
    R(0, 14, W, 40, '#D9CCB4')
    for x in range(14, 320, 46):
        R(x, 19, x + 18, 33, '#BFD3D6')
        R(x, 19, x + 18, 20, '#9FB7BC')
        R(x + 8, 19, x + 9, 33, '#9FB7BC')
    R(0, 40, W, 66, '#C9BDA8')
    for x in range(0, 320, 24):
        R(x, 40, x + 1, 66, '#B6AA95')
    E(298, 24, 22, 13, '#86A86E')
    E(286, 19, 12, 8, '#9BBC80')
    R(296, 32, 300, 42, '#6E5238')
    for (px, col) in [(40, '#8C8FA0'), (178, '#A08C8C'), (236, '#8CA096')]:
        E(px, 28, 3, 3, '#7A6A5A')
        R(px - 3, 31, px + 4, 41, col)
    R(0, 0, W, 4, '#3A2416')
    for i, x in enumerate(range(0, 320, 12)):
        col = '#E07A3A' if i % 2 == 0 else '#F4E6C8'
        R(x, 4, x + 12, 11, col)
        E(x + 6, 11, 6, 3, col)
    R(0, 4, W, 5, '#B85A24')
    R(0, 0, 8, 66, '#5A3A24')
    R(6, 0, 7, 66, '#7A5232')
    R(312, 0, 320, 66, '#5A3A24')
    R(312, 0, 313, 66, '#7A5232')

    # 客人那一側的櫃台
    R(0, 60, W, 66, '#D7A86C')
    R(0, 60, W, 61, '#EAC48E')
    R(0, 66, W, 78, '#A8743F')
    for x in range(0, 320, 40):
        R(x, 67, x + 1, 77, '#8C5E30')
    R(0, 77, W, 78, '#5A3A24')

    # 自己這邊的不鏽鋼工作台
    R(0, 78, W, 180, '#AEB4BB')
    R(0, 78, W, 80, '#D5DAE0')
    for y in range(83, 174, 3):
        R(0, y, W, y + 1, '#A7ADB4')
    R(0, 174, W, 180, '#8E959D')
    R(0, 174, W, 175, '#C8CDD3')
    overlay(lambda ld: (E(160, 131, 101, 48, (40, 28, 18, 80), dd=ld), E(74, 99, 12, 3, (40, 28, 18, 70), dd=ld)))

    # 爐火與空鍋
    E(160, 129, 97, 47, '#1A1A1E')
    E(160, 128, 94, 45, '#E8742A')
    for _ in range(70):
        x, y = random.randint(78, 242), random.randint(160, 172)
        if ((x - 160) / 94) ** 2 + ((y - 128) / 45) ** 2 < 0.98:
            P(x, y, '#F2C14E')
    E(160, 124, 92, 44, '#5E5E68')
    E(160, 125, 92, 43, '#2A2A30')
    E(160, 126, 87, 40, '#4A4A52')
    E(160, 128, 85, 38, '#3A3A41')
    overlay(lambda ld: (E(120, 106, 20, 5, (255, 255, 255, 22), dd=ld), E(202, 116, 22, 5, (255, 255, 255, 14), dd=ld)))
    for hx in (58, 252):
        R(hx, 118, hx + 10, 128, '#2A2A30')
        R(hx, 118, hx + 10, 119, '#5E5E68')
        R(hx + 3, 121, hx + 7, 125, '#AEB4BB')

    # 生餃盤
    d.polygon([(6, 98), (54, 98), (58, 150), (2, 150)], fill='#E2E6EA')
    d.polygon([(8, 100), (52, 100), (55, 148), (5, 148)], fill='#B9BFC6')
    for ry in (102, 108, 114, 120, 126, 132, 138):
        for k in range(5):
            raw_sticker(10 + k * 9, ry, 8, 5)

    # 粉漿水壺
    R(60, 82, 62, 94, '#8E959D')
    R(60, 82, 67, 84, '#8E959D')
    R(60, 92, 67, 94, '#8E959D')
    R(66, 78, 85, 98, '#C2C8CE')
    R(79, 78, 85, 98, '#9AA1A9')
    R(68, 80, 70, 96, '#E4E8EC')
    d.polygon([(84, 76), (91, 72), (89, 79), (84, 81)], fill='#C2C8CE')
    E(75, 78, 9, 3, '#E9EDF0')
    E(75, 78, 7, 2, '#F7F3E8')

    # 空的保溫台
    d.polygon([(268, 108), (318, 108), (320, 152), (264, 152)], fill='#E2E6EA')
    d.polygon([(270, 110), (316, 110), (318, 150), (266, 150)], fill='#B9BFC6')

    # 鏟子
    d.polygon([(4, 170), (30, 162), (32, 166), (6, 174)], fill='#8A5A30')
    d.polygon([(30, 160), (50, 154), (56, 164), (34, 170)], fill='#D5D9DE', outline='#8E959D')
    save('bg.png')


# ---------------- 防噴罩玻璃（疊在客人前面） ----------------
def glass():
    canvas()

    def draw(ld):
        ld.rectangle([8, 36, 311, 59], fill=(210, 236, 246, 46))
        ld.rectangle([8, 36, 311, 36], fill=(245, 252, 255, 170))
        for x in (34, 150, 238):
            ld.line([(x, 59), (x + 14, 37)], fill=(255, 255, 255, 70), width=2)
            ld.line([(x + 6, 59), (x + 18, 40)], fill=(255, 255, 255, 40), width=1)
    overlay(draw)
    for x in (98, 222):
        R(x, 36, x + 2, 60, '#9AA1A9')
    save('glass.png')


# ---------------- 鍋蓋：放在旁邊、蓋在鍋上 ----------------
def lids():
    canvas()
    overlay(lambda ld: E(286, 95, 32, 11, (40, 28, 18, 60), dd=ld))
    E(286, 92, 30, 11, '#8E959D')
    E(286, 90, 30, 11, '#D5D9DE')
    E(286, 89, 25, 8, '#E4E8EC')
    E(286, 89, 16, 5, None, '#BFC4CA')
    R(282, 83, 291, 89, '#2A2A30')
    R(282, 83, 291, 84, '#5E5E68')
    save('lid-rest.png')

    canvas()
    E(160, 124, 93, 44, '#7E858D')
    E(160, 121, 92, 43, '#C9CED4')
    E(160, 117, 74, 32, '#D9DDE2')
    E(160, 113, 50, 20, '#E6E9ED')
    E(160, 110, 30, 11, '#EEF1F4')
    overlay(lambda ld: ld.arc([96, 92, 170, 130], 190, 250, fill=(255, 255, 255, 160), width=2))
    R(152, 96, 169, 106, '#2A2A30')
    R(152, 96, 169, 98, '#5E5E68')
    save('lid-on.png')


# ---------------- 客人（面向玩家，下半身被櫃台擋住） ----------------
def customer(cx, hair, skin, shirt, shade, kind):
    E(cx, 53, 16, 8, OL)
    R(cx - 16, 53, cx + 17, 67, OL)
    E(cx, 53, 15, 7, shirt)
    R(cx - 15, 53, cx + 16, 67, shirt)
    R(cx + 10, 52, cx + 16, 67, shade)
    R(cx - 3, 41, cx + 4, 48, skin)
    E(cx, 34, 9, 10, skin, OL)
    if kind == 'delivery':
        E(cx, 29, 11, 8, '#2F8F8A', OL)
        R(cx - 10, 31, cx + 11, 33, '#1F6B67')
        R(cx - 4, 22, cx + 4, 24, '#5FB8B2')
    else:
        E(cx, 29, 10, 7, hair)
        R(cx - 10, 29, cx - 6, 38, hair)
        R(cx + 7, 29, cx + 11, 38, hair)
        R(cx - 6, 29, cx + 7, 32, hair)
        if kind == 'mom':
            E(cx, 20, 5, 4, hair, OL)
            R(cx - 10, 29, cx - 6, 44, hair)
            R(cx + 7, 29, cx + 11, 44, hair)
        if kind == 'student':
            R(cx - 10, 29, cx - 6, 42, hair)
            R(cx + 7, 29, cx + 11, 42, hair)
    R(cx - 4, 35, cx - 2, 38, '#1A120C')
    R(cx + 3, 35, cx + 5, 38, '#1A120C')
    R(cx - 7, 39, cx - 4, 40, '#F2A48C')
    R(cx + 5, 39, cx + 8, 40, '#F2A48C')
    R(cx - 1, 41, cx + 2, 42, '#B0604A')
    if kind == 'office':
        R(cx - 5, 46, cx + 6, 49, '#FFFFFF')
        R(cx - 1, 48, cx + 2, 66, '#2D4E8A')
    if kind == 'student':
        d.polygon([(cx - 7, 46), (cx, 52), (cx + 7, 46)], fill='#FFFFFF')
        R(cx - 1, 51, cx + 2, 56, '#C0392B')
    if kind == 'mom':
        R(cx - 9, 44, cx - 7, 46, '#F2C14E')
    if kind == 'delivery':
        R(cx - 15, 57, cx + 16, 59, '#F2C14E')
        R(cx - 2, 47, cx + 3, 66, '#1F6B67')


LOOKS = [
    ('#2A2018', '#F0C8A0', '#F2F2EE', '#D6D6D0', 'office'),
    ('#1C1A1A', '#F3CFAA', '#5B83B8', '#4A6E9E', 'student'),
    ('#6B3E22', '#EEC29C', '#E58A7A', '#C9705F', 'mom'),
    ('#000000', '#E9BD94', '#2F7F7A', '#256864', 'delivery'),
]


def customers():
    # 每張圖 40x44，左上角對應場景座標 (客人中心 x - 20, 16)
    for i, look in enumerate(LOOKS):
        canvas()
        customer(20, *look)
        save(f'customer-{i}.png', (0, 16, 40, 60))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    background()
    glass()
    lids()
    customers()
    print('wrote', sorted(p.name for p in OUT.iterdir()))
