import balance from './balance.json';
import { BoilPot } from './boilPot';
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
  potsticker: number; // 要幾顆鍋貼（0 = 不點）
  dumpling: number; // 要幾顆水餃（0 = 不點）
  gotPotsticker: boolean; // 鍋貼拿到了沒（不點的一開始就算拿到）
  gotDumpling: boolean; // 水餃拿到了沒
  waited: number; // 等了幾秒
}

// 一間店的所有狀態都在這裡。畫面只讀這裡的資料、呼叫這裡的動作，不自己算規則。
export class Shop {
  pan = new Pan();
  pots: BoilPot[];
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
    this.pots = Array.from({ length: cfg.boil.pots }, () => new BoilPot(cfg.boil));
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

  /** 新手提示：排隊的人還缺幾顆鍋貼，扣掉保溫台和鍋裡正在煎的 */
  suggestedLoad() {
    const demand = this.customers.reduce((sum, c) => sum + (c.gotPotsticker ? 0 : c.potsticker), 0);
    const cooking = this.pan.state === 'steaming' || this.pan.state === 'crisping' ? this.pan.count : 0;
    const missing = demand - this.trayCount - cooking;
    return Math.max(0, Math.min(this.pan.cfg.capacity, missing) - this.pan.count);
  }

  /** 下一張要煮的水餃單：最早來、還沒拿到水餃、也還沒在鍋裡煮的那位 */
  nextDumplingOrder(): Customer | undefined {
    const cooking = this.pots.map((p) => p.orderId);
    return this.customers
      .filter((c) => !c.gotDumpling && !cooking.includes(c.id))
      .sort((a, b) => a.id - b.id)[0];
  }

  // ---------- 玩家動作：鍋貼 ----------

  /** 鏟出放上保溫台 */
  scoop() {
    const batch = this.pan.scoop();
    if (batch) this.tray.push({ ...batch, age: 0 });
    return batch;
  }

  /**
   * 把鍋貼出給某位客人：保溫台夠才出，先拿最舊的。
   * 'done' = 這位的東西都拿齊、結帳走了；'ok' = 鍋貼給了，還在等水餃；
   * 'nothing' = 這位沒點鍋貼或已經拿過；'not-enough' = 保溫台不夠
   */
  serve(customerId: number): 'done' | 'ok' | 'nothing' | 'not-enough' | 'no-customer' {
    const c = this.customers.find((x) => x.id === customerId);
    if (!c) return 'no-customer';
    if (c.gotPotsticker) return 'nothing';
    if (this.trayCount < c.potsticker) return 'not-enough';

    let need = c.potsticker;
    while (need > 0) {
      const b = this.tray[0];
      const take = Math.min(need, b.count);
      b.count -= take;
      need -= take;
      this.stats.qualitySum += take * b.quality;
      if (b.count === 0) this.tray.shift();
    }
    this.stats.pieces += c.potsticker;
    this.stats.revenue += c.potsticker * this.cfg.price;
    c.gotPotsticker = true;
    return this.finishIfDone(c) ? 'done' : 'ok';
  }

  // ---------- 玩家動作：水餃 ----------

  /** 點某一口鍋：空鍋就下鍋、滾了就點冷水、浮起就撈起。回傳要提示玩家的話（沒事是 null） */
  usePot(i: number): string | null {
    const pot = this.pots[i];
    if (pot.state === 'empty') {
      const c = this.nextDumplingOrder();
      if (!c) return '目前沒有水餃單';
      pot.load(c.id, c.dumpling);
      return `下鍋：#${c.id} 水餃 ${c.dumpling} 顆`;
    }
    if (pot.state === 'boiling') {
      pot.addColdWater();
      return pot.coldWater >= pot.cfg.times ? '浮起來了！' : `點冷水 ${pot.coldWater} / ${pot.cfg.times}`;
    }
    if (pot.state === 'floating') {
      const result = pot.scoop()!;
      const c = this.customers.find((x) => x.id === result.orderId);
      if (!c) {
        this.stats.wasted += result.count; // 客人等不及走了，這鍋沒人要
        return `#${result.orderId} 已經走了，${result.count} 顆水餃報廢`;
      }
      this.stats.qualitySum += result.count * result.quality;
      this.stats.pieces += result.count;
      this.stats.revenue += result.count * this.cfg.price;
      c.gotDumpling = true;
      const done = this.finishIfDone(c);
      return `撈起 ${result.count} 顆給 #${c.id}${result.quality < 100 ? '（有破皮）' : ''}${done ? '，結帳！' : '，還要鍋貼'}`;
    }
    return null; // 加熱中：沒事可做
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

    this.pots.forEach((pot, i) => {
      const count = pot.count;
      const event = pot.update(dt);
      if (event === 'broke') news.push(`${i + 1} 號鍋沒點冷水，水餃破皮了`);
      if (event === 'mushy') {
        this.stats.wasted += count;
        news.push(`${i + 1} 號鍋煮爛了，${count} 顆報廢`);
      }
    });

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

  /** 鍋貼、水餃都拿到了就結帳離開 */
  private finishIfDone(c: Customer) {
    if (!c.gotPotsticker || !c.gotDumpling) return false;
    this.stats.served += 1;
    this.stats.waitSum += c.waited;
    this.customers = this.customers.filter((x) => x !== c);
    return true;
  }

  private spawnCustomer() {
    const taken = this.customers.map((c) => c.slot);
    const free = [...Array(this.cfg.customers.slots).keys()].filter((s) => !taken.includes(s));
    if (free.length === 0) return; // 櫃台站滿了，這位就不進來

    const cc = this.cfg.customers;
    const between = (min: number, max: number) => min + Math.floor(this.rng() * (max - min + 1));
    // 點什麼：只點水餃、兩樣都點、只點鍋貼
    const r = this.rng();
    const wantsDumpling = r < cc.dumplingOnlyRate + cc.bothRate;
    const wantsPotsticker = r >= cc.dumplingOnlyRate;
    const potsticker = wantsPotsticker ? between(cc.orderMin, cc.orderMax) : 0;
    const dumpling = wantsDumpling ? between(cc.dumplingMin, cc.dumplingMax) : 0;

    this.customers.push({
      id: this.nextId++,
      slot: free[Math.floor(this.rng() * free.length)],
      look: Math.floor(this.rng() * 4),
      potsticker,
      dumpling,
      gotPotsticker: potsticker === 0,
      gotDumpling: dumpling === 0,
      waited: 0,
    });
  }
}
