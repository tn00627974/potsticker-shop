import balance from './balance.json';

// 大鐵鍋的狀態：
// empty 空鍋 → loaded 排鍋中 → steaming 蓋鍋蒸 → crisping 開蓋收乾 → 鏟出後回到 empty
// 收乾太久 → burnt 燒焦 → 按清鍋 → cleaning 清鍋中 → empty
export type PanState = 'empty' | 'loaded' | 'steaming' | 'crisping' | 'burnt' | 'cleaning';

export class Pan {
  state: PanState = 'empty';
  count = 0; // 鍋裡有幾顆
  timer = 0; // 進入目前狀態幾秒了

  constructor(readonly cfg = balance.pan) {}

  /** 排鍋。回傳實際放進去幾顆（鍋滿了、或已經開始煎就放不進去） */
  add(n: number): number {
    if (this.state !== 'empty' && this.state !== 'loaded') return 0;
    const added = Math.max(0, Math.min(n, this.cfg.capacity - this.count));
    this.count += added;
    this.state = this.count > 0 ? 'loaded' : 'empty';
    return added;
  }

  /** 排鍋時拿出來。回傳實際拿出幾顆 */
  remove(n: number): number {
    if (this.state !== 'loaded') return 0;
    const removed = Math.min(n, this.count);
    this.count -= removed;
    this.state = this.count > 0 ? 'loaded' : 'empty';
    return removed;
  }

  /** 淋粉漿水、蓋鍋，開始蒸 */
  cover(): boolean {
    if (this.state !== 'loaded') return false;
    this.enter('steaming');
    return true;
  }

  /** 鏟出這一鍋。不在收乾階段回傳 null */
  scoop(): { count: number; quality: number } | null {
    if (this.state !== 'crisping') return null;
    const batch = { count: this.count, quality: this.quality() };
    this.count = 0;
    this.enter('empty');
    return batch;
  }

  /** 燒焦後清鍋，清完才能再排 */
  clean(): boolean {
    if (this.state !== 'burnt') return false;
    this.count = 0;
    this.enter('cleaning');
    return true;
  }

  /** 現在鏟出的品質：太早偏生、時間窗內完美、太晚偏焦 */
  quality(): number {
    const { perfectFrom, perfectTo, quality } = this.cfg;
    if (this.timer < perfectFrom) return quality.under;
    if (this.timer <= perfectTo) return quality.perfect;
    return quality.over;
  }

  /** 每幀呼叫。燒焦的那一刻回傳燒掉幾顆（算損耗用），其他時候回傳 0 */
  update(dt: number): number {
    this.timer += dt;
    if (this.state === 'steaming' && this.timer >= this.cfg.steamSec) {
      this.enter('crisping');
    } else if (this.state === 'crisping' && this.timer > this.cfg.crispSec) {
      this.enter('burnt');
      return this.count;
    } else if (this.state === 'cleaning' && this.timer >= this.cfg.cleanSec) {
      this.enter('empty');
    }
    return 0;
  }

  private enter(state: PanState) {
    this.state = state;
    this.timer = 0;
  }
}
