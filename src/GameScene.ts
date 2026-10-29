import Phaser from 'phaser';
import { Shop } from './shop';

// 像素圖是 320x180，放大 4 倍畫在 1280x720 上。
// 「美術座標」= 像素圖上的座標；「畫面座標」= 美術座標 × S。
const S = 4;
const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const INK = '#2A1B10';
const CREAM = '#F4EAD5';

// 網址加 ?speed=5 可以快轉（測試用）
const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

// 櫃台外客人站的位置（美術座標，客人中心 x），索引就是 Customer.slot
const SLOT_X = [66, 128, 196, 262];

// 鍋裡 30 格（美術座標）：5 排，越前面的排越大，看起來有透視
const PAN_SLOTS: { x: number; y: number; w: number; h: number }[] = [];
[5, 6, 8, 6, 5].forEach((n, r) => {
  const w = 13 + r;
  const h = 8 + Math.floor((r + 1) / 2);
  const left = 160 - Math.floor((n * w + n - 1) / 2);
  for (let k = 0; k < n; k++) PAN_SLOTS.push({ x: left + k * (w + 1), y: [100, 111, 122, 134, 146][r], w, h });
});

// 鍋貼顏色 [表皮, 摺子, 底部]
const RAW = [0xf3e7cd, 0xd6c29c, 0x9c8862];
const UNDER = [0xefdcae, 0xd9c08a, 0xc08a48];
const PERFECT = [0xebc77e, 0xd9ae5e, 0xa8641e];
const OVER = [0xd39a4a, 0xb97d36, 0x6e3a12];
const BURNT = [0x4a2e1a, 0x3a2416, 0x1a0e08];
const WARM = [0xd9be86, 0xc9a96a, 0x9a6a30];

const ART = ['bg', 'glass', 'lid-on', 'lid-rest', 'customer-0', 'customer-1', 'customer-2', 'customer-3'];

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: Phaser.GameObjects.Text;
  enabled: boolean;
  color: number;
}

export class GameScene extends Phaser.Scene {
  private shop = new Shop();
  private elapsed = 0;

  private art!: Phaser.GameObjects.Graphics; // 美術座標：鍋貼、保溫台
  private steam!: Phaser.GameObjects.Graphics; // 美術座標：蒸氣、煙（在鍋蓋上面）
  private ui!: Phaser.GameObjects.Graphics; // 畫面座標：泡泡、時間條、按鈕底
  private lidOn!: Phaser.GameObjects.Image;
  private lidRest!: Phaser.GameObjects.Image;
  private customerImgs: Phaser.GameObjects.Image[] = [];
  private bubbleTexts: Phaser.GameObjects.Text[] = [];
  private buttons: Button[] = [];
  private mainBtn!: Button;
  private clockText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private panText!: Phaser.GameObjects.Text;
  private trayText!: Phaser.GameObjects.Text;
  private toastText?: Phaser.GameObjects.Text;

  constructor() {
    super('game');
    (window as any).shop = this.shop; // 除錯用：瀏覽器 console 打 shop 就能看、改目前狀態
  }

  preload() {
    for (const key of ART) this.load.image(key, `art/${key}.png`);
  }

  create() {
    for (const key of ART) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);

    // ---- 美術座標的圖層（由下往上） ----
    const world = this.add.container(0, 0).setScale(S);
    world.add(this.add.image(0, 0, 'bg').setOrigin(0));
    for (const x of SLOT_X) {
      const img = this.add.image(x - 20, 16, 'customer-0').setOrigin(0).setVisible(false);
      this.customerImgs.push(img);
      world.add(img);
    }
    world.add(this.add.image(0, 0, 'glass').setOrigin(0));
    this.lidRest = this.add.image(0, 0, 'lid-rest').setOrigin(0);
    this.art = this.add.graphics();
    this.lidOn = this.add.image(0, 0, 'lid-on').setOrigin(0).setVisible(false);
    this.steam = this.add.graphics();
    world.add([this.lidRest, this.art, this.lidOn, this.steam]);

    // ---- 畫面座標的介面 ----
    this.ui = this.add.graphics();
    this.clockText = this.text(16, 12, 26, CREAM, '#1C130C');
    this.statsText = this.text(1264, 12, 15, CREAM, '#1C130C').setOrigin(1, 0);
    this.panText = this.text(640, 322, 15, CREAM, 'rgba(18,11,6,0.86)').setOrigin(0.5, 0).setAlign('center');
    this.trayText = this.text(1062, 410, 12, CREAM, 'rgba(18,11,6,0.86)');
    this.text(16, 360, 13, INK, '#FFF8EA').setText('生餃盤：點盤子放 1 顆');
    this.text(362, 282, 13, INK, '#FFF8EA').setText('點水壺或鍋蓋：淋粉漿水・蓋鍋');
    SLOT_X.forEach((x) => this.bubbleTexts.push(this.text(x * S + 52, 104, 15, INK).setVisible(false)));

    // ---- 點場景裡的東西 ----
    SLOT_X.forEach((x, slot) => this.zone(x * S - 72, 64, 242, 176, () => this.serveSlot(slot)));
    this.zone(0, 392, 236, 216, () => this.shop.pan.add(1)); // 生餃盤
    this.zone(240, 288, 128, 112, () => this.shop.pan.cover()); // 水壺
    this.zone(1016, 312, 256, 96, () => this.shop.pan.cover()); // 鍋蓋
    this.zone(300, 400, 680, 270, () => this.clickPan()); // 鍋子（不要跟水壺重疊）

    // ---- 按鈕 ----
    this.button(16, 640, 56, 56, '−1', 0xf4ead5, () => this.shop.pan.remove(1));
    this.button(80, 640, 56, 56, '+1', 0xf4ead5, () => this.shop.pan.add(1));
    this.button(144, 640, 56, 56, '+5', 0xf2c14e, () => this.shop.pan.add(5));
    this.mainBtn = this.button(992, 624, 272, 80, '', 0xe8742a, () => this.mainAction());

    // ---- 鍵盤：空白鍵 = 主要動作，1 / 5 = 放鍋貼，Backspace = 拿出來 ----
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.mainAction());
    kb.on('keydown-ONE', () => this.shop.pan.add(1));
    kb.on('keydown-FIVE', () => this.shop.pan.add(5));
    kb.on('keydown-BACKSPACE', () => this.shop.pan.remove(1));
  }

  update(_time: number, delta: number) {
    const dt = (delta / 1000) * SPEED;
    this.elapsed += dt;
    for (const msg of this.shop.update(dt)) this.toast(msg, '#FF9C6B');

    this.ui.clear();
    this.drawPan();
    this.drawTray();
    this.drawCustomers();
    this.drawHud();
    this.drawButtons();
  }

  // ---------- 玩家動作 ----------

  private mainAction() {
    const pan = this.shop.pan;
    if (pan.state === 'loaded') pan.cover();
    else if (pan.state === 'crisping') this.scoop();
    else if (pan.state === 'burnt') pan.clean();
  }

  private clickPan() {
    const pan = this.shop.pan;
    if (pan.state === 'empty' || pan.state === 'loaded') pan.add(1);
    else this.mainAction();
  }

  private scoop() {
    const batch = this.shop.scoop();
    if (!batch) return;
    const word = { 70: '偏生', 100: '完美！', 80: '偏焦' }[batch.quality] ?? '';
    this.toast(`鏟出 ${batch.count} 顆・品質 ${batch.quality} ${word}`, batch.quality === 100 ? '#F2C14E' : CREAM);
  }

  private serveSlot(slot: number) {
    const c = this.shop.customers.find((x) => x.slot === slot);
    if (!c) return;
    const result = this.shop.serve(c.id);
    if (result === 'ok') this.toast(`出餐 ${c.order} 顆  +$${c.order * this.shop.cfg.price}`, '#9BE38B');
    if (result === 'not-enough') this.toast(`保溫台不夠，還差 ${c.order - this.shop.trayCount} 顆`, '#FF9C6B');
  }

  // ---------- 每幀畫面 ----------

  private drawPan() {
    const { state, count, timer, cfg } = this.shop.pan;
    const g = this.art;
    g.clear();

    let colors = RAW;
    if (state === 'crisping') colors = timer < cfg.perfectFrom ? UNDER : timer <= cfg.perfectTo ? PERFECT : OVER;
    if (state === 'burnt') colors = BURNT;
    const cooked = state === 'crisping' || state === 'burnt';
    const sparkle = colors === PERFECT && Math.floor(this.elapsed * 4) % 2 === 0;

    PAN_SLOTS.forEach((s, i) => {
      if (i < count) {
        sticker(g, s.x, s.y, s.w, s.h, colors, cooked);
        if (sparkle && i % 3 === 0) g.fillStyle(0xffffff).fillRect(s.x + 3, s.y + 2, 1, 1);
      } else if (state === 'empty' || state === 'loaded') {
        g.fillStyle(0x5c5c66);
        for (let x = s.x + 1; x < s.x + s.w - 1; x += 2) g.fillRect(x, s.y + 1, 1, 1).fillRect(x, s.y + s.h - 1, 1, 1);
      }
    });

    this.lidOn.setVisible(state === 'steaming');
    this.lidRest.setVisible(state !== 'steaming');

    // 蒸氣：蒸的時候從鍋蓋冒，收乾時淡一點；燒焦冒灰煙
    const st = this.steam;
    st.clear();
    if (state === 'steaming' || state === 'crisping' || state === 'burnt') {
      const color = state === 'burnt' ? 0x6e6e6e : 0xffffff;
      const strength = state === 'steaming' ? 0.7 : state === 'burnt' ? 0.8 : 0.3;
      [118, 146, 174, 202].forEach((x, i) => {
        const rise = (this.elapsed * 10 + i * 5) % 18;
        st.fillStyle(color, strength * (1 - rise / 18));
        st.fillRect(x + Math.round(Math.sin(rise / 3) * 2), 84 - rise, 6, 3);
        st.fillRect(x + 1 + Math.round(Math.sin(rise / 3) * 2), 83 - rise, 4, 1);
      });
    }

    // 鍋子上方的狀態與時間條
    const left = (sec: number) => Math.max(0, Math.ceil(sec - timer));
    const lines: Record<string, string> = {
      empty: '空鍋　點生餃盤或 +1 / +5 放鍋貼',
      loaded: `排鍋中　${count} / ${cfg.capacity} 格`,
      steaming: `蓋鍋蒸　還有 ${left(cfg.steamSec)} 秒`,
      crisping: `開蓋收乾　黃色區間內鏟出最好`,
      burnt: '燒焦了！點鍋子清鍋',
      cleaning: `清鍋中　${left(cfg.cleanSec)} 秒`,
    };
    let text = lines[state];
    const suggest = this.shop.suggestedLoad();
    if ((state === 'empty' || state === 'loaded') && suggest > 0) text += `\n照排隊的量，建議再放 ${suggest} 顆`;
    this.panText.setText(text);

    if (state === 'crisping') this.drawCrispBar(490, 380, 300, 16);
  }

  private drawCrispBar(x: number, y: number, w: number, h: number) {
    const { timer, cfg } = this.shop.pan;
    const at = (sec: number) => x + (sec / cfg.crispSec) * w;
    this.ui.fillStyle(0x120b06).fillRect(x - 3, y - 3, w + 6, h + 6);
    this.ui.fillStyle(0xe9dfc8).fillRect(x, y, at(cfg.perfectFrom) - x, h);
    this.ui.fillStyle(0xf2c14e).fillRect(at(cfg.perfectFrom), y, at(cfg.perfectTo) - at(cfg.perfectFrom), h);
    this.ui.fillStyle(0xa8341a).fillRect(at(cfg.perfectTo), y, x + w - at(cfg.perfectTo), h);
    this.ui.fillStyle(0xffffff).fillRect(at(Math.min(timer, cfg.crispSec)) - 2, y - 6, 4, h + 12);
  }

  private drawTray() {
    // 保溫台最多畫 12 顆（3 x 4），舊的在前面
    const pieces: boolean[] = [];
    for (const b of this.shop.tray) for (let i = 0; i < b.count; i++) pieces.push(this.shop.isFresh(b));
    pieces.slice(0, 12).forEach((fresh, i) => {
      sticker(this.art, 272 + (i % 3) * 14, 112 + Math.floor(i / 3) * 9, 13, 8, fresh ? PERFECT : WARM, true);
    });

    const total = this.shop.trayCount;
    const oldest = this.shop.tray[0];
    const wasteIn = oldest ? Math.ceil(this.shop.cfg.tray.wasteSec - oldest.age) : 0;
    this.trayText.setText(total ? `保溫台 ${total} 顆\n最舊的 ${wasteIn} 秒後報廢` : '保溫台 空的');
  }

  private drawCustomers() {
    SLOT_X.forEach((_, slot) => {
      const c = this.shop.customers.find((x) => x.slot === slot);
      const img = this.customerImgs[slot];
      const bubble = this.bubbleTexts[slot];
      img.setVisible(!!c);
      bubble.setVisible(!!c);
      if (!c) return;

      img.setTexture(`customer-${c.look}`);
      bubble.setText(`招牌 ×${c.order}`);
      const bx = bubble.x - 12;
      const by = bubble.y - 8;
      const bw = 128;
      const bh = 52;
      this.ui.fillStyle(0x2a1b10).fillRect(bx + 3, by + 3, bw, bh); // 影子
      this.ui.fillStyle(0xfff8ea).lineStyle(3, 0x2a1b10).fillRect(bx, by, bw, bh).strokeRect(bx, by, bw, bh);

      const left = 1 - c.waited / this.shop.cfg.customers.patienceSec;
      const color = left > 0.5 ? 0x4e8a3e : left > 0.25 ? 0xe8742a : 0xa8341a;
      this.ui.fillStyle(0xe2d3b5).fillRect(bx + 10, by + bh - 16, bw - 20, 8);
      this.ui.fillStyle(color).fillRect(bx + 10, by + bh - 16, (bw - 20) * Math.max(0, left), 8);
    });
  }

  private drawHud() {
    const t = Math.floor(this.elapsed);
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    this.clockText.setText(`0.1 原型  ${mm}:${ss}`);

    const s = this.shop;
    this.statsText.setText(
      `營收 $${s.stats.revenue}　損耗 ${s.stats.wasted} 顆　平均等候 ${Math.round(s.avgWait)} 秒　` +
        `品質 ${s.stats.pieces ? Math.round(s.avgQuality) : '-'}　走掉 ${s.stats.left} 人`,
    );
  }

  private drawButtons() {
    const { state, count, timer, cfg } = this.shop.pan;
    const left = (sec: number) => Math.max(0, Math.ceil(sec - timer));
    const labels: Record<string, string> = {
      empty: '先放鍋貼',
      loaded: `淋粉漿水・蓋鍋\n已放 ${count} 顆`,
      steaming: `蒸煮中…\n還有 ${left(cfg.steamSec)} 秒`,
      crisping: `鏟出！\n現在品質 ${this.shop.pan.quality()}`,
      burnt: '清鍋',
      cleaning: '清鍋中…',
    };
    this.mainBtn.label.setText(labels[state]);
    this.mainBtn.enabled = state === 'loaded' || state === 'crisping' || state === 'burnt';
    const canLoad = state === 'empty' || state === 'loaded';
    this.buttons.filter((b) => b !== this.mainBtn).forEach((b) => (b.enabled = canLoad));

    for (const b of this.buttons) {
      this.ui.fillStyle(0x120b06).fillRect(b.x + 4, b.y + 4, b.w, b.h);
      this.ui.fillStyle(b.enabled ? b.color : 0x4a3828).fillRect(b.x, b.y, b.w, b.h);
      this.ui.lineStyle(3, 0x120b06).strokeRect(b.x, b.y, b.w, b.h);
      b.label.setColor(b.enabled ? INK : '#A8957A');
    }
  }

  // ---------- 小工具 ----------

  private text(x: number, y: number, size: number, color: string, bg?: string) {
    return this.add.text(x, y, '', {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      backgroundColor: bg,
      padding: bg ? { x: 10, y: 6 } : undefined,
      lineSpacing: 4,
      resolution: 2,
    });
  }

  private zone(x: number, y: number, w: number, h: number, onClick: () => void) {
    this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }

  private button(x: number, y: number, w: number, h: number, text: string, color: number, onClick: () => void) {
    const label = this.text(x + w / 2, y + h / 2, 20, INK).setOrigin(0.5).setAlign('center').setText(text).setDepth(1);
    this.zone(x, y, w, h, onClick);
    const b: Button = { x, y, w, h, label, enabled: true, color };
    this.buttons.push(b);
    return b;
  }

  /** 畫面中間的提示，新的會蓋掉舊的 */
  private toast(msg: string, color: string) {
    this.toastText ??= this.text(640, 236, 22, CREAM, 'rgba(18,11,6,0.9)').setOrigin(0.5).setDepth(2);
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setColor(color).setAlpha(1).setY(236);
    this.tweens.add({ targets: this.toastText, y: 200, alpha: 0, delay: 900, duration: 700 });
  }
}

/** 畫一顆鍋貼（美術座標）。cooked = 底部煎出焦色 */
function sticker(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, colors: number[], cooked: boolean) {
  const [body, pleat, bottom] = colors;
  g.fillStyle(pleat).fillRect(x + 2, y, w - 4, 1);
  g.fillStyle(body).fillRect(x + 1, y + 1, w - 2, h - 2).fillRect(x, y + 2, w, h - 4);
  g.fillStyle(pleat);
  for (let i = x + 2; i < x + w - 2; i += 2) g.fillRect(i, y + 1, 1, 1);
  g.fillStyle(bottom).fillRect(x + 1, y + h - 1, w - 2, 1);
  if (cooked) g.fillRect(x, y + h - 3, w, 2);
}
