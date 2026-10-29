import { describe, expect, it } from 'vitest';
import { Shop } from '../src/shop';

// 固定的亂數，讓客人出現的時間、位置、點單每次都一樣
const fixed = (value: number) => () => value;

function shopWithCustomer(order: number) {
  const shop = new Shop(fixed(0));
  shop.customers.push({ id: 99, slot: 0, look: 0, order, waited: 10 });
  return shop;
}

describe('出餐', () => {
  it('保溫台不夠就不能出', () => {
    const shop = shopWithCustomer(10);
    shop.tray.push({ count: 6, quality: 100, age: 0 });
    expect(shop.serve(99)).toBe('not-enough');
    expect(shop.trayCount).toBe(6);
  });

  it('先拿最舊的那一批，收錢、記等候時間', () => {
    const shop = shopWithCustomer(10);
    shop.tray.push({ count: 6, quality: 70, age: 50 }, { count: 20, quality: 100, age: 5 });
    expect(shop.serve(99)).toBe('ok');
    expect(shop.tray).toEqual([{ count: 16, quality: 100, age: 5 }]);
    expect(shop.stats.revenue).toBe(10 * shop.cfg.price);
    expect(shop.avgWait).toBe(10);
    expect(shop.avgQuality).toBe((6 * 70 + 4 * 100) / 10);
    expect(shop.customers).toHaveLength(0);
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
  it('第一位客人準時出現', () => {
    const shop = new Shop(fixed(0));
    shop.update(shop.cfg.customers.firstSpawnSec);
    expect(shop.customers).toHaveLength(1);
    expect(shop.customers[0].order).toBe(shop.cfg.customers.orderMin);
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
  it('排隊要的減掉保溫台和鍋裡的', () => {
    const shop = shopWithCustomer(30);
    shop.tray.push({ count: 6, quality: 100, age: 0 });
    shop.pan.add(10);
    expect(shop.suggestedLoad()).toBe(30 - 6 - 10);
  });
});
