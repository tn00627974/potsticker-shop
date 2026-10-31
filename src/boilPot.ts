import balance from './balance.json';

/**
 * 一口水餃鍋的狀態，照順序走一輪：
 * empty →（下鍋）→ heating → boiling →（點冷水）→ heating → … 第 3 次點完 → floating →（撈起）→ empty
 */
export type PotState =
  | 'empty' // 空鍋：水一直滾著，等玩家下鍋。不會自己變成別的狀態
  | 'heating' // 加熱中：剛下鍋或剛點完冷水，heatSec 秒後會再滾起來，這段時間玩家可以去顧煎台
  | 'boiling' // 滾了：有 boilWindowSec 秒可以點冷水；沒點就破皮，並自動當作點了一次
  | 'floating'; // 浮起：點滿 times 次冷水後水餃浮起，floatSec 秒內要撈起，太久就煮爛、整鍋報廢

// 水餃是「點了才煮」：一鍋只煮一張單，煮好直接給那位客人，不經過保溫台（跟鍋貼相反）
export class BoilPot {
  state: PotState = 'empty';
  orderId: number | null = null; // 這鍋是哪位客人的單
  count = 0; // 鍋裡幾顆
  coldWater = 0; // 點了幾次冷水
  broken = false; // 有沒有漏點過冷水（破皮）
  timer = 0; // 進入目前狀態幾秒了

  constructor(readonly cfg = balance.boil) {}

  /** 下鍋：只有空鍋可以下，而且不能超過一鍋的容量 */
  load(orderId: number, count: number): boolean {
    if (this.state !== 'empty' || count <= 0 || count > this.cfg.capacity) return false;
    this.orderId = orderId;
    this.count = count;
    this.coldWater = 0;
    this.broken = false;
    this.enter('heating');
    return true;
  }

  /** 點冷水：只有滾的時候有用。點滿次數就浮起，否則回去加熱 */
  addColdWater(): boolean {
    if (this.state !== 'boiling') return false;
    this.coldWater += 1;
    this.enter(this.coldWater >= this.cfg.times ? 'floating' : 'heating');
    return true;
  }

  /** 撈起：回傳是哪張單、幾顆、品質；不在浮起階段回傳 null */
  scoop(): { orderId: number; count: number; quality: number } | null {
    if (this.state !== 'floating' || this.orderId === null) return null;
    const { quality } = this.cfg;
    const result = { orderId: this.orderId, count: this.count, quality: this.broken ? quality.broken : quality.good };
    this.reset();
    return result;
  }

  /** 現在這個狀態還剩幾秒（加熱、滾、浮起都有時限；空鍋回傳 0） */
  timeLeft(): number {
    const c = this.cfg;
    const limit = { empty: 0, heating: c.heatSec, boiling: c.boilWindowSec, floating: c.floatSec }[this.state];
    return Math.max(0, limit - this.timer);
  }

  /**
   * 每幀呼叫。回傳這一幀發生的事：
   * 'broke' = 漏點冷水、破皮了；'mushy' = 浮起太久、煮爛報廢（報廢顆數看呼叫前的 count）；null = 沒事
   */
  update(dt: number): 'broke' | 'mushy' | null {
    this.timer += dt;
    const c = this.cfg;
    if (this.state === 'heating' && this.timer >= c.heatSec) {
      this.enter('boiling');
    } else if (this.state === 'boiling' && this.timer > c.boilWindowSec) {
      this.broken = true; // 漏點：破皮，但照樣算點了一次，繼續煮
      this.addColdWater();
      return 'broke';
    } else if (this.state === 'floating' && this.timer > c.floatSec) {
      this.reset();
      return 'mushy';
    }
    return null;
  }

  private enter(state: PotState) {
    this.state = state;
    this.timer = 0;
  }

  private reset() {
    this.orderId = null;
    this.count = 0;
    this.enter('empty');
  }
}
