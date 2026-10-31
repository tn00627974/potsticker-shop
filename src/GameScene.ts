import Phaser from 'phaser';
import type { BoilPot } from './boilPot';
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
const SLOT_X = [30, 67, 104, 141, 179, 216, 253, 290];

// 水餃鍋中心 x（美術座標），要跟 tools/placeholder_art.py 的 POT_X 一樣
const POT_X = [100, 222];
const POT_TOP = 104; // 鍋緣（水面）的 y

// 鍋裡 50 格（美術座標）：6 排，越前面的排越大，看起來有透視
// 每排 [顆數, y, 寬, 高]；顆數加起來要等於 balance.json 的 pan.capacity
const PAN_ROWS = [
  [6, 97, 11, 7],
  [9, 107, 12, 7],
  [10, 117, 12, 8],
  [10, 128, 13, 8],
  [9, 139, 13, 9],
  [6, 150, 14, 9],
];
const PAN_SLOTS: { x: number; y: number; w: number; h: number }[] = [];
for (const [n, y, w, h] of PAN_ROWS) {
  const left = 160 - Math.floor((n * w + n - 1) / 2);
  for (let k = 0; k < n; k++) PAN_SLOTS.push({ x: left + k * (w + 1), y, w, h });
}

// 水餃在水面上的位置（相對鍋子中心，美術座標）：4 排 × 5 顆 = 一鍋最多 20 顆
const DUMPLING_SPOTS: { dx: number; dy: number }[] = [];
for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) DUMPLING_SPOTS.push({ dx: -37 + k * 15 + (r % 2) * 6, dy: -11 + r * 6 });

// 鍋貼顏色 [表皮, 摺子, 底部]
const RAW = [0xf3e7cd, 0xd6c29c, 0x9c8862];
const UNDER = [0xefdcae, 0xd9c08a, 0xc08a48];
const PERFECT = [0xebc77e, 0xd9ae5e, 0xa8641e];
const OVER = [0xd39a4a, 0xb97d36, 0x6e3a12];
const BURNT = [0x4a2e1a, 0x3a2416, 0x1a0e08];
const WARM = [0xd9be86, 0xc9a96a, 0x9a6a30];

const ART = ['bg', 'boil-bg', 'glass', 'lid-on', 'lid-rest', 'customer-0', 'customer-1', 'customer-2', 'customer-3'];

/** 現在站在哪個工作站前面：煎台（大鐵鍋）或煮鍋（水餃） */
type View = 'pan' | 'boil';

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: Phaser.GameObjects.Text;
  enabled: boolean;
  color: number;
  view: View | 'both'; // 在哪個工作站才顯示
}

export class GameScene extends Phaser.Scene {
  private shop = new Shop();
  private elapsed = 0;
  private view: View = 'pan';

  // 兩個工作站各自的東西，切換時整組顯示／隱藏
  private panObjects: Phaser.GameObjects.GameObject[] = [];
  private boilObjects: Phaser.GameObjects.GameObject[] = [];

  private art!: Phaser.GameObjects.Graphics; // 美術座標：鍋貼、保溫台
  private steam!: Phaser.GameObjects.Graphics; // 美術座標：蒸氣、煙（在鍋蓋上面）
  private potArt!: Phaser.GameObjects.Graphics; // 美術座標：水餃鍋的水面、水餃、泡沫、蒸氣
  private ui!: Phaser.GameObjects.Graphics; // 畫面座標：泡泡、時間條、按鈕底
  private lidOn!: Phaser.GameObjects.Image;
  private lidRest!: Phaser.GameObjects.Image;
  private customerImgs: Phaser.GameObjects.Image[] = [];
  private bubbleTexts: Phaser.GameObjects.Text[] = [];
  private potTexts: Phaser.GameObjects.Text[] = [];
  private buttons: Button[] = [];
  private mainBtn!: Button;
  private panTab!: Button;
  private boilTab!: Button;
  private clockText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private panText!: Phaser.GameObjects.Text;
  private panMiniText!: Phaser.GameObjects.Text; // 在煮鍋前時，左上角提醒煎台的狀況
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
    const panBg = this.add.image(0, 0, 'bg').setOrigin(0);
    const boilBg = this.add.image(0, 0, 'boil-bg').setOrigin(0);
    world.add([panBg, boilBg]);
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
    this.potArt = this.add.graphics();
    world.add([this.lidRest, this.art, this.lidOn, this.steam, this.potArt]);

    // ---- 畫面座標的介面 ----
    this.ui = this.add.graphics();
    this.clockText = this.text(16, 12, 26, CREAM, '#1C130C');
    this.statsText = this.text(1264, 12, 15, CREAM, '#1C130C').setOrigin(1, 0);
    this.panText = this.text(640, 322, 15, CREAM, 'rgba(18,11,6,0.86)').setOrigin(0.5, 0).setAlign('center');
    this.trayText = this.text(1062, 410, 12, CREAM, 'rgba(18,11,6,0.86)');
    const trayHint = this.text(16, 360, 13, INK, '#FFF8EA').setText('生餃盤：點盤子放 1 顆');
    const lidHint = this.text(16, 324, 13, INK, '#FFF8EA').setText('點水壺或鍋蓋：淋粉漿水・蓋鍋');
    const boilHint = this.text(16, 330, 13, INK, '#FFF8EA').setText('點空鍋：下最早那張水餃單');
    this.panMiniText = this.text(16, 64, 14, CREAM, 'rgba(18,11,6,0.9)');
    SLOT_X.forEach((x) => this.bubbleTexts.push(this.text(x * S - 52, 252, 14, INK).setVisible(false)));
    POT_X.forEach((x) => this.potTexts.push(this.text(x * S - 138, 462, 17, INK).setLineSpacing(8)));

    this.panObjects = [panBg, this.lidRest, this.art, this.lidOn, this.steam, this.panText, this.trayText, trayHint, lidHint];
    this.boilObjects = [boilBg, this.potArt, boilHint, this.panMiniText, ...this.potTexts];

    // ---- 點場景裡的東西（每個區域只在它的工作站有作用） ----
    SLOT_X.forEach((x, slot) => this.zone(x * S - 74, 64, 148, 248, 'both', () => this.serveSlot(slot)));
    this.zone(0, 392, 236, 216, 'pan', () => this.shop.pan.add(1)); // 生餃盤
    this.zone(240, 288, 128, 112, 'pan', () => this.shop.pan.cover()); // 水壺
    this.zone(1016, 312, 256, 96, 'pan', () => this.shop.pan.cover()); // 鍋蓋
    this.zone(300, 400, 680, 270, 'pan', () => this.clickPan()); // 鍋子（不要跟水壺重疊）
    POT_X.forEach((x, i) => this.zone(x * S - 230, 320, 460, 340, 'boil', () => this.usePot(i))); // 水餃鍋

    // ---- 按鈕 ----
    this.button(16, 640, 56, 56, '−1', 0xf4ead5, 'pan', () => this.shop.pan.remove(1));
    this.button(80, 640, 56, 56, '+1', 0xf4ead5, 'pan', () => this.shop.pan.add(1));
    this.button(144, 640, 56, 56, '+5', 0xf2c14e, 'pan', () => this.shop.pan.add(5));
    this.mainBtn = this.button(992, 624, 272, 80, '', 0xe8742a, 'pan', () => this.mainAction());
    this.panTab = this.button(520, 656, 120, 48, '煎台  Q', 0xf4ead5, 'both', () => this.setView('pan'));
    this.boilTab = this.button(640, 656, 120, 48, '煮鍋  E', 0xf4ead5, 'both', () => this.setView('boil'));

    // ---- 鍵盤 ----
    // 空白鍵 = 現在這個工作站的主要動作；Q / E / Tab = 切換工作站
    // 煎台：1 / 5 = 放鍋貼，Backspace = 拿出來；煮鍋：1 / 2 = 點那口鍋
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => (this.view === 'pan' ? this.mainAction() : this.usePot(this.urgentPot())));
    kb.on('keydown-Q', () => this.setView('pan'));
    kb.on('keydown-E', () => this.setView('boil'));
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.setView(this.view === 'pan' ? 'boil' : 'pan');
    });
    kb.on('keydown-ONE', () => (this.view === 'pan' ? this.shop.pan.add(1) : this.usePot(0)));
    kb.on('keydown-TWO', () => this.view === 'boil' && this.usePot(1));
    kb.on('keydown-FIVE', () => this.view === 'pan' && this.shop.pan.add(5));
    kb.on('keydown-BACKSPACE', () => this.view === 'pan' && this.shop.pan.remove(1));

    this.setView('pan');
  }

  update(_time: number, delta: number) {
    const dt = (delta / 1000) * SPEED;
    this.elapsed += dt;
    for (const msg of this.shop.update(dt)) this.toast(msg, '#FF9C6B');

    this.ui.clear();
    if (this.view === 'pan') {
      this.drawPan();
      this.drawTray();
    } else {
      this.drawPots();
      this.drawPanMini();
    }
    this.drawCustomers();
    this.drawHud();
    this.drawButtons();
    this.drawAlert();
  }

  // ---------- 玩家動作 ----------

  /** 切換工作站：顯示這一站的東西、藏起另一站的 */
  private setView(view: View) {
    this.view = view;
    for (const o of this.panObjects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(view === 'pan');
    for (const o of this.boilObjects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(view === 'boil');
    if (view === 'boil') this.lidOn.setVisible(false); // 鍋蓋在 drawPan 才會再決定要不要顯示
  }

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

  private usePot(i: number) {
    const msg = this.shop.usePot(i);
    if (msg) this.toast(msg, msg.includes('報廢') ? '#FF9C6B' : '#9BE3F2');
  }

  /** 空白鍵在煮鍋前要點哪一口：先救快沒時間的（滾了 > 浮起），都沒有就下鍋 */
  private urgentPot() {
    const pots = this.shop.pots;
    const by = (state: string) => pots.findIndex((p) => p.state === state);
    return [by('boiling'), by('floating'), by('empty')].find((i) => i >= 0) ?? 0;
  }

  private serveSlot(slot: number) {
    const c = this.shop.customers.find((x) => x.slot === slot);
    if (!c) return;
    const result = this.shop.serve(c.id);
    const money = `+$${c.potsticker * this.shop.cfg.price}`;
    if (result === 'done') this.toast(`出鍋貼 ${c.potsticker} 顆 ${money}，結帳！`, '#9BE38B');
    if (result === 'ok') this.toast(`出鍋貼 ${c.potsticker} 顆 ${money}，還在等水餃`, '#9BE38B');
    if (result === 'nothing') this.toast(c.dumpling ? `#${c.id} 在等水餃，去煮鍋那邊` : '這位已經拿到鍋貼了', CREAM);
    if (result === 'not-enough') this.toast(`保溫台不夠，還差 ${c.potsticker - this.shop.trayCount} 顆`, '#FF9C6B');
  }

  // ---------- 每幀畫面：煎台 ----------

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
      this.puffs(st, [118, 146, 174, 202], 84, color, strength);
    }

    let text = this.panStatus();
    const suggest = this.shop.suggestedLoad();
    if ((state === 'empty' || state === 'loaded') && suggest > 0) text += `\n照排隊的量，建議再放 ${suggest} 顆`;
    this.panText.setText(text);

    if (state === 'crisping') this.drawCrispBar(490, 380, 300, 16);
  }

  /** 煎台現在在做什麼（一行字），煎台畫面和煮鍋畫面左上角都用 */
  private panStatus() {
    const { state, count, timer, cfg } = this.shop.pan;
    const left = (sec: number) => Math.max(0, Math.ceil(sec - timer));
    const lines: Record<string, string> = {
      empty: '空鍋　點生餃盤或 +1 / +5 放鍋貼',
      loaded: `排鍋中　${count} / ${cfg.capacity} 格`,
      steaming: `蓋鍋蒸　還有 ${left(cfg.steamSec)} 秒`,
      crisping: `開蓋收乾　黃色區間內鏟出最好`,
      burnt: '燒焦了！點鍋子清鍋',
      cleaning: `清鍋中　${left(cfg.cleanSec)} 秒`,
    };
    return lines[state];
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

  // ---------- 每幀畫面：煮鍋 ----------

  private drawPots() {
    const g = this.potArt;
    g.clear();
    this.shop.pots.forEach((pot, i) => {
      const cx = POT_X[i];
      this.drawPotWater(g, cx, pot);
      this.drawPotCard(i, cx * S, pot);
    });
  }

  /** 一口鍋的水面（美術座標）：加熱冒小泡、滾了泡沫溢出、浮起看得到水餃 */
  private drawPotWater(g: Phaser.GameObjects.Graphics, cx: number, pot: BoilPot) {
    const y = POT_TOP + 1;
    g.fillStyle(0x8fc3d9).fillEllipse(cx, y, 94, 30);

    // 小氣泡：越接近滾越多
    const heat = pot.state === 'heating' ? pot.timer / pot.cfg.heatSec : pot.state === 'empty' ? 0.3 : 1;
    const bubbles = Math.round(4 + heat * 14);
    for (let k = 0; k < bubbles; k++) {
      const a = k * 2.39 + this.elapsed * (1 + (k % 3));
      g.fillStyle(0xddeff6).fillRect(Math.round(cx + Math.cos(a) * (10 + (k * 7) % 36)), Math.round(y + Math.sin(a) * 9), 1, 1);
    }

    // 水餃：煮的時候沉在水裡（淡），浮起後清楚
    if (pot.state !== 'empty') {
      const floating = pot.state === 'floating';
      for (let k = 0; k < pot.count; k++) {
        const s = DUMPLING_SPOTS[k];
        const bob = floating ? Math.round(Math.sin(this.elapsed * 3 + k) * 0.6) : 0;
        dumpling(g, cx + s.dx, y + s.dy + bob, floating, pot.broken && k % 4 === 1);
      }
    }

    // 滾了：白色泡沫從鍋緣溢出、抖動
    if (pot.state === 'boiling') {
      const shake = Math.floor(this.elapsed * 8) % 2;
      g.fillStyle(0xf4fafc);
      for (let k = 0; k < 7; k++) g.fillEllipse(cx - 42 + k * 14, POT_TOP - 13 + ((k + shake) % 2) * 3, 14, 10);
      for (let k = 0; k < 14; k++) g.fillEllipse(cx - 40 + ((k * 23) % 80), y - 6 + ((k * 7) % 13), 6, 4);
      g.fillStyle(0xddeff6).fillRect(cx - 30, POT_TOP + 16, 3, 10).fillRect(cx + 22, POT_TOP + 16, 3, 14); // 溢出來流下去
    }

    // 蒸氣：滾的時候最濃
    if (pot.state !== 'empty') this.puffs(g, [cx - 30, cx - 10, cx + 10, cx + 30], POT_TOP - 18, 0xffffff, pot.state === 'boiling' ? 0.7 : 0.35);
  }

  /** 鍋身上的單子卡（畫面座標）：哪張單、冷水點了幾次、現在要做什麼、剩幾秒 */
  private drawPotCard(i: number, x: number, pot: BoilPot) {
    const w = 300;
    const h = 128;
    const left = x - w / 2;
    const top = 452;
    const urgent = pot.state === 'boiling' || pot.state === 'floating';
    const border = pot.state === 'boiling' ? 0x1f6573 : pot.state === 'floating' ? 0xf2c14e : 0x2a1b10;
    this.ui.fillStyle(0x2a1b10).fillRect(left + 4, top + 4, w, h);
    this.ui.fillStyle(0xfff8ea).fillRect(left, top, w, h);
    this.ui.lineStyle(urgent ? 5 : 3, border).strokeRect(left, top, w, h);

    const dots = '●'.repeat(pot.coldWater) + '○'.repeat(pot.cfg.times - pot.coldWater);
    const secs = Math.ceil(pot.timeLeft());
    const head = `${i + 1} 號鍋　#${pot.orderId} 水餃 ×${pot.count}${pot.broken ? '　破皮' : ''}`;
    let text: string;
    if (pot.state === 'empty') {
      const next = this.shop.nextDumplingOrder();
      text = `${i + 1} 號鍋　空鍋\n${next ? `點鍋子：下 #${next.id} 的水餃 ×${next.dumpling}` : '目前沒有水餃單'}`;
    } else if (pot.state === 'heating') {
      text = `${head}\n冷水 ${dots}　加熱中 ${secs} 秒`;
    } else if (pot.state === 'boiling') {
      text = `${head}\n滾了！點鍋子加冷水 ${dots}`;
    } else {
      text = `${head}\n浮起了！點鍋子撈起`;
    }
    this.potTexts[i].setText(text);

    // 時限條：滾了（藍）、浮起（黃）、加熱（灰）都畫，讓玩家知道還有多久
    if (pot.state !== 'empty') {
      const limit = { heating: pot.cfg.heatSec, boiling: pot.cfg.boilWindowSec, floating: pot.cfg.floatSec }[pot.state];
      const color = { heating: 0xb9bfc6, boiling: 0x1f6573, floating: 0xf2c14e }[pot.state];
      const barW = w - 24;
      this.ui.fillStyle(0xe2d3b5).fillRect(left + 12, top + h - 26, barW, 12);
      this.ui.fillStyle(color).fillRect(left + 12, top + h - 26, barW * (pot.timeLeft() / limit), 12);
    }
  }

  /** 在煮鍋前時，左上角的煎台小卡：提醒什麼時候該回去 */
  private drawPanMini() {
    const state = this.shop.pan.state;
    const urgent = state === 'crisping' || state === 'burnt';
    this.panMiniText.setText(`煎台：${this.panStatus()}${urgent ? '　→ 按 Q 回去！' : ''}`);
    this.panMiniText.setColor(urgent ? '#F2C14E' : CREAM);
  }

  /** 另一個工作站需要你的時候，畫面邊緣閃框（煮鍋：藍、煎台：橘） */
  private drawAlert() {
    const pots = this.shop.pots;
    const potNeedsYou = pots.some((p) => p.state === 'boiling' || p.state === 'floating');
    const panNeedsYou = this.shop.pan.state === 'crisping' || this.shop.pan.state === 'burnt';
    const color = this.view === 'pan' && potNeedsYou ? 0x3fa7d6 : this.view === 'boil' && panNeedsYou ? 0xe8742a : null;

    this.boilTab.label.setText(this.view === 'pan' && potNeedsYou ? '煮鍋  E  !' : '煮鍋  E');
    this.panTab.label.setText(this.view === 'boil' && panNeedsYou ? '煎台  Q  !' : '煎台  Q');
    if (color === null || Math.floor(this.elapsed * 3) % 2 === 1) return;
    this.ui.lineStyle(12, color, 0.85).strokeRect(6, 6, 1268, 708);
  }

  // ---------- 每幀畫面：兩站共用 ----------

  private drawCustomers() {
    SLOT_X.forEach((_, slot) => {
      const c = this.shop.customers.find((x) => x.slot === slot);
      const img = this.customerImgs[slot];
      const bubble = this.bubbleTexts[slot];
      img.setVisible(!!c);
      bubble.setVisible(!!c);
      if (!c) return;

      img.setTexture(`customer-${c.look}`);
      // 點單：拿到的打勾；正在鍋裡煮的水餃標「煮」
      const cooking = this.shop.pots.some((p) => p.orderId === c.id);
      const lines = [];
      if (c.potsticker) lines.push(`鍋貼 ×${c.potsticker}${c.gotPotsticker ? ' ✓' : ''}`);
      if (c.dumpling) lines.push(`水餃 ×${c.dumpling}${c.gotDumpling ? ' ✓' : cooking ? ' 煮' : ''}`);
      bubble.setText(lines.join('\n'));

      const bx = bubble.x - 10;
      const by = bubble.y - 6;
      const bw = 128;
      const bh = 62;
      this.ui.fillStyle(0x2a1b10).fillRect(bx + 3, by + 3, bw, bh); // 影子
      this.ui.fillStyle(0xfff8ea).lineStyle(3, 0x2a1b10).fillRect(bx, by, bw, bh).strokeRect(bx, by, bw, bh);

      const left = 1 - c.waited / this.shop.cfg.customers.patienceSec;
      const color = left > 0.5 ? 0x4e8a3e : left > 0.25 ? 0xe8742a : 0xa8341a;
      this.ui.fillStyle(0xe2d3b5).fillRect(bx + 10, by + bh - 12, bw - 20, 6);
      this.ui.fillStyle(color).fillRect(bx + 10, by + bh - 12, (bw - 20) * Math.max(0, left), 6);
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
    for (const b of this.buttons) if (b.view === 'pan' && b !== this.mainBtn) b.enabled = canLoad;

    // 分頁：現在這一站亮、另一站暗
    this.panTab.color = this.view === 'pan' ? 0xf4ead5 : 0x3a2a1e;
    this.boilTab.color = this.view === 'boil' ? 0xf4ead5 : 0x3a2a1e;

    for (const b of this.buttons) {
      const shown = b.view === 'both' || b.view === this.view;
      b.label.setVisible(shown);
      if (!shown) continue;
      const isTab = b === this.panTab || b === this.boilTab;
      this.ui.fillStyle(0x120b06).fillRect(b.x + 4, b.y + 4, b.w, b.h);
      this.ui.fillStyle(b.enabled ? b.color : 0x4a3828).fillRect(b.x, b.y, b.w, b.h);
      this.ui.lineStyle(3, 0x120b06).strokeRect(b.x, b.y, b.w, b.h);
      const dark = isTab && b.color === 0x3a2a1e;
      b.label.setColor(!b.enabled ? '#A8957A' : dark ? CREAM : INK);
    }
  }

  // ---------- 小工具 ----------

  /** 往上飄的煙（美術座標）：蒸氣、燒焦的煙共用 */
  private puffs(g: Phaser.GameObjects.Graphics, xs: number[], baseY: number, color: number, strength: number) {
    xs.forEach((x, i) => {
      const rise = (this.elapsed * 10 + i * 5) % 18;
      g.fillStyle(color, strength * (1 - rise / 18));
      g.fillRect(x + Math.round(Math.sin(rise / 3) * 2), baseY - rise, 6, 3);
      g.fillRect(x + 1 + Math.round(Math.sin(rise / 3) * 2), baseY - 1 - rise, 4, 1);
    });
  }

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

  /** 可以點的區域；view = 只在哪個工作站有作用（另一站點了沒反應） */
  private zone(x: number, y: number, w: number, h: number, view: View | 'both', onClick: () => void) {
    this.add
      .zone(x, y, w, h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (view === 'both' || view === this.view) onClick();
      });
  }

  private button(x: number, y: number, w: number, h: number, text: string, color: number, view: View | 'both', onClick: () => void) {
    const label = this.text(x + w / 2, y + h / 2, 20, INK).setOrigin(0.5).setAlign('center').setText(text).setDepth(1);
    this.zone(x, y, w, h, view, onClick);
    const b: Button = { x, y, w, h, label, enabled: true, color, view };
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

/** 畫一顆水餃（美術座標）。floating = 浮起來（亮、清楚）；沒浮起就淡淡的沉在水裡 */
function dumpling(g: Phaser.GameObjects.Graphics, x: number, y: number, floating: boolean, broken: boolean) {
  const alpha = floating ? 1 : 0.45;
  g.fillStyle(0xe2d8c0, alpha).fillRect(x + 1, y, 8, 1);
  g.fillStyle(floating ? 0xf6f1e4 : 0xe9eef0, alpha).fillRect(x, y + 1, 10, 3);
  g.fillStyle(0xc9bc9c, alpha).fillRect(x + 1, y + 4, 8, 1);
  if (floating) g.fillStyle(0xffffff).fillRect(x + 2, y + 1, 2, 1);
  if (broken) g.fillStyle(0xb5653a, alpha).fillRect(x + 5, y + 2, 2, 1);
}
