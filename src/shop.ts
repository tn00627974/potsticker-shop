import balance from './balance.json';
import { Pan } from './pan';

/** 保溫台上的一批鍋貼 */
export interface Batch {
  count: number;
  quality: number;
  age: number; // 起鍋幾秒了
}

export interface Customer {
  id: number;
  slot: number; // 站在櫃台第幾個位置（0 開始）
  look: number; // 用哪張客人圖
  order: number; // 要幾顆
  waited: number; // 等了幾秒
}

// 一間店的所有狀態都在這裡。畫面只讀這裡的資料、呼叫這裡的動作，不自己算規則。
export class Shop {
  pan = new Pan();
  tray: Batch[] = []; // 舊的在前面，出餐先拿舊的
  customers: Customer[] = [];
  stats = { revenue: 0, served: 0, left: 0, wasted: 0, waitSum: 0, qualitySum: 0, pieces: 0 };

  private nextSpawn: number;
  private nextId = 1;

  constructor(
    private rng: () => number = Math.random,
    readonly cfg = balance,
  ) {
    this.nextSpawn = cfg.customers.firstSpawnSec;
  }

  get trayCount() {
    return this.tray.reduce((sum, b) => sum + b.count, 0);
  }

  get avgWait() {
    return this.stats.served ? this.stats.waitSum / this.stats.served : 0;
  }

  get avgQuality() {
    return this.stats.pieces ? this.stats.qualitySum / this.stats.pieces : 0;
  }

  isFresh(b: Batch) {
    return b.age <= this.cfg.tray.freshSec;
  }

  /** 新手提示：排隊的人還缺幾顆，扣掉保溫台和鍋裡正在煎的 */
  suggestedLoad() {
    const demand = this.customers.reduce((sum, c) => sum + c.order, 0);
    const cooking = this.pan.state === 'steaming' || this.pan.state === 'crisping' ? this.pan.count : 0;
    const missing = demand - this.trayCount - cooking;
    return Math.max(0, Math.min(this.pan.cfg.capacity, missing) - this.pan.count);
  }

  // ---------- 玩家動作 ----------

  /** 鏟出放上保溫台 */
  scoop() {
    const batch = this.pan.scoop();
    if (batch) this.tray.push({ ...batch, age: 0 });
    return batch;
  }

  /** 出餐給某位客人：保溫台夠才出，先拿最舊的 */
  serve(customerId: number): 'ok' | 'not-enough' | 'no-customer' {
    const c = this.customers.find((x) => x.id === customerId);
    if (!c) return 'no-customer';
    if (this.trayCount < c.order) return 'not-enough';

    let need = c.order;
    while (need > 0) {
      const b = this.tray[0];
      const take = Math.min(need, b.count);
      b.count -= take;
      need -= take;
      this.stats.qualitySum += take * b.quality;
      if (b.count === 0) this.tray.shift();
    }
    this.stats.pieces += c.order;
    this.stats.revenue += c.order * this.cfg.price;
    this.stats.served += 1;
    this.stats.waitSum += c.waited;
    this.customers = this.customers.filter((x) => x !== c);
    return 'ok';
  }

  // ---------- 時間 ----------

  /** 每幀呼叫。回傳這一幀發生、要提示玩家的事 */
  update(dt: number): string[] {
    const news: string[] = [];

    const burnt = this.pan.update(dt);
    if (burnt > 0) {
      this.stats.wasted += burnt;
      news.push(`燒焦了，${burnt} 顆報廢`);
    }

    for (const b of this.tray) b.age += dt;
    const spoiled = this.tray.filter((b) => b.age > this.cfg.tray.wasteSec);
    if (spoiled.length > 0) {
      const n = spoiled.reduce((sum, b) => sum + b.count, 0);
      this.stats.wasted += n;
      this.tray = this.tray.filter((b) => !spoiled.includes(b));
      news.push(`保溫台放太久，${n} 顆報廢`);
    }

    for (const c of this.customers) c.waited += dt;
    const gone = this.customers.filter((c) => c.waited > this.cfg.customers.patienceSec);
    if (gone.length > 0) {
      this.stats.left += gone.length;
      this.customers = this.customers.filter((c) => !gone.includes(c));
      news.push(`${gone.length} 位客人等太久走了`);
    }

    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.spawnCustomer();
      const { spawnMinSec, spawnMaxSec } = this.cfg.customers;
      this.nextSpawn = spawnMinSec + this.rng() * (spawnMaxSec - spawnMinSec);
    }

    return news;
  }

  private spawnCustomer() {
    const taken = this.customers.map((c) => c.slot);
    const free = [...Array(this.cfg.customers.slots).keys()].filter((s) => !taken.includes(s));
    if (free.length === 0) return; // 櫃台站滿了，這位就不進來
    const { orderMin, orderMax } = this.cfg.customers;
    this.customers.push({
      id: this.nextId++,
      slot: free[Math.floor(this.rng() * free.length)],
      look: Math.floor(this.rng() * 4),
      order: orderMin + Math.floor(this.rng() * (orderMax - orderMin + 1)),
      waited: 0,
    });
  }
}
