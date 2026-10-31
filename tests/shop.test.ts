import { describe, expect, it } from 'vitest';
import { Shop, type Customer } from '../src/shop';

// 固定的亂數，讓客人出現的時間、位置、點單每次都一樣
const fixed = (value: number) => () => value;

/** 放一位客人進店：預設只點鍋貼 */
function shopWithCustomer(potsticker: number, dumpling = 0) {
  const shop = new Shop(fixed(0));
  const c: Customer = {
    id: 99, slot: 0, look: 0, potsticker, dumpling,
    gotPotsticker: potsticker === 0, gotDumpling: dumpling === 0, waited: 10,
  };
  shop.customers.push(c);
  return shop;
}

/** 讓 0 號鍋一路煮到浮起（每次滾都有點冷水） */
function cookToFloating(shop: Shop) {
  const pot = shop.pots[0];
  for (let i = 0; i < pot.cfg.times; i++) {
    shop.update(pot.cfg.heatSec);
    shop.usePot(0);
  }
}

describe('鍋貼出餐', () => {
  it('保溫台不夠就不能出', () => {
    const shop = shopWithCustomer(10);
    shop.tray.push({ count: 6, quality: 100, age: 0 });
    expect(shop.serve(99)).toBe('not-enough');
    expect(shop.trayCount).toBe(6);
  });

  it('先拿最舊的那一批，收錢、記等候時間', () => {
    const shop = shopWithCustomer(10);
    shop.tray.push({ count: 6, quality: 70, age: 50 }, { count: 20, quality: 100, age: 5 });
    expect(shop.serve(99)).toBe('done');
    expect(shop.tray).toEqual([{ count: 16, quality: 100, age: 5 }]);
    expect(shop.stats.revenue).toBe(10 * shop.cfg.price);
    expect(shop.avgWait).toBe(10);
    expect(shop.avgQuality).toBe((6 * 70 + 4 * 100) / 10);
    expect(shop.customers).toHaveLength(0);
  });

  it('還在等水餃的客人拿到鍋貼後不會走', () => {
    const shop = shopWithCustomer(5, 8);
    shop.tray.push({ count: 5, quality: 100, age: 0 });
    expect(shop.serve(99)).toBe('ok');
    expect(shop.customers).toHaveLength(1);
    expect(shop.serve(99)).toBe('nothing');
  });
});

describe('水餃', () => {
  it('點空鍋就下最早那張水餃單', () => {
    const shop = shopWithCustomer(0, 8);
    expect(shop.usePot(0)).toBe('下鍋：#99 水餃 8 顆');
    expect(shop.pots[0].state).toBe('heating');
    expect(shop.nextDumplingOrder()).toBeUndefined(); // 已經在鍋裡，不會再下第二鍋
  });

  it('沒有水餃單時空鍋點了沒反應', () => {
    const shop = shopWithCustomer(10);
    expect(shop.usePot(0)).toBe('目前沒有水餃單');
    expect(shop.pots[0].state).toBe('empty');
  });

  it('撈起交給客人，兩樣都齊就結帳', () => {
    const shop = shopWithCustomer(0, 8);
    shop.usePot(0);
    cookToFloating(shop);
    expect(shop.pots[0].state).toBe('floating');
    expect(shop.usePot(0)).toBe('撈起 8 顆給 #99，結帳！');
    expect(shop.customers.some((c) => c.id === 99)).toBe(false); // 煮的這段時間會有別的客人進來，只看 #99 走了沒
    expect(shop.stats.revenue).toBe(8 * shop.cfg.price);
    expect(shop.avgQuality).toBe(100);
  });

  it('客人先走了，撈起來的水餃算報廢', () => {
    const shop = shopWithCustomer(0, 8);
    shop.usePot(0);
    cookToFloating(shop);
    shop.customers = [];
    shop.usePot(0);
    expect(shop.stats.wasted).toBe(8);
  });

  it('浮起太久煮爛，算進損耗', () => {
    const shop = shopWithCustomer(0, 8);
    shop.usePot(0);
    cookToFloating(shop);
    const news = shop.update(shop.cfg.boil.floatSec + 0.1);
    expect(news).toContain('1 號鍋煮爛了，8 顆報廢');
    expect(shop.stats.wasted).toBe(8);
    expect(shop.pots[0].state).toBe('empty');
  });
});

describe('保溫台', () => {
  it('放超過報廢時間就丟掉，算進損耗', () => {
    const shop = new Shop(fixed(0));
    shop.tray.push({ count: 8, quality: 100, age: 0 });
    shop.update(shop.cfg.tray.wasteSec);
    expect(shop.trayCount).toBe(8);
    const news = shop.update(1);
    expect(shop.trayCount).toBe(0);
    expect(shop.stats.wasted).toBe(8);
    expect(news).toContain('保溫台放太久，8 顆報廢');
  });
});

describe('客人', () => {
  it('第一位客人準時出現，點什麼由亂數決定', () => {
    const shop = new Shop(fixed(0)); // 亂數 0 → 只點水餃
    shop.update(shop.cfg.customers.firstSpawnSec);
    expect(shop.customers).toHaveLength(1);
    expect(shop.customers[0].potsticker).toBe(0);
    expect(shop.customers[0].dumpling).toBe(shop.cfg.customers.dumplingMin);

    const shop2 = new Shop(fixed(0.99)); // 亂數接近 1 → 只點鍋貼
    shop2.update(shop2.cfg.customers.firstSpawnSec);
    expect(shop2.customers[0].potsticker).toBeGreaterThan(0);
    expect(shop2.customers[0].dumpling).toBe(0);
  });

  it('等太久就走，算進離開人數', () => {
    const shop = shopWithCustomer(10);
    shop.update(shop.cfg.customers.patienceSec);
    expect(shop.customers.some((c) => c.id === 99)).toBe(false);
    expect(shop.stats.left).toBe(1);
  });

  it('櫃台站滿就不再進來', () => {
    const shop = new Shop(fixed(0.5));
    for (let i = 0; i < 20; i++) shop.update(20);
    expect(shop.customers.length).toBeLessThanOrEqual(shop.cfg.customers.slots);
    const slots = shop.customers.map((c) => c.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('建議下鍋量', () => {
  it('排隊要的鍋貼減掉保溫台和鍋裡的', () => {
    const shop = shopWithCustomer(30);
    shop.tray.push({ count: 6, quality: 100, age: 0 });
    shop.pan.add(10);
    expect(shop.suggestedLoad()).toBe(30 - 6 - 10);
  });
});
