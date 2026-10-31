import { describe, expect, it } from 'vitest';
import { BoilPot } from '../src/boilPot';

describe('下鍋', () => {
  it('空鍋才能下，而且不能超過容量', () => {
    const pot = new BoilPot();
    expect(pot.load(1, pot.cfg.capacity + 1)).toBe(false);
    expect(pot.load(1, 8)).toBe(true);
    expect(pot.state).toBe('heating');
    expect(pot.load(2, 8)).toBe(false);
  });

  it('空鍋放著不會自己變狀態', () => {
    const pot = new BoilPot();
    pot.update(100);
    expect(pot.state).toBe('empty');
  });
});

describe('點冷水', () => {
  it('加熱完才會滾，滾了才能點', () => {
    const pot = new BoilPot();
    pot.load(1, 8);
    expect(pot.addColdWater()).toBe(false);
    pot.update(pot.cfg.heatSec);
    expect(pot.state).toBe('boiling');
    expect(pot.addColdWater()).toBe(true);
    expect(pot.state).toBe('heating');
  });

  it('點滿次數就浮起，撈起品質 100', () => {
    const pot = new BoilPot();
    pot.load(7, 8);
    for (let i = 0; i < pot.cfg.times; i++) {
      pot.update(pot.cfg.heatSec);
      pot.addColdWater();
    }
    expect(pot.state).toBe('floating');
    expect(pot.scoop()).toEqual({ orderId: 7, count: 8, quality: pot.cfg.quality.good });
    expect(pot.state).toBe('empty');
  });
});

describe('失誤', () => {
  it('滾了沒點冷水：破皮、自動算一次，繼續煮', () => {
    const pot = new BoilPot();
    pot.load(1, 8);
    pot.update(pot.cfg.heatSec);
    expect(pot.update(pot.cfg.boilWindowSec + 0.1)).toBe('broke');
    expect(pot.broken).toBe(true);
    expect(pot.coldWater).toBe(1);
    expect(pot.state).toBe('heating');
  });

  it('破過皮的那鍋，撈起品質變低', () => {
    const pot = new BoilPot();
    pot.load(1, 8);
    for (let i = 0; i < pot.cfg.times; i++) {
      pot.update(pot.cfg.heatSec);
      pot.update(pot.cfg.boilWindowSec + 0.1); // 每次都漏點
    }
    expect(pot.state).toBe('floating');
    expect(pot.scoop()?.quality).toBe(pot.cfg.quality.broken);
  });

  it('浮起太久就煮爛，鍋子清空', () => {
    const pot = new BoilPot();
    pot.load(1, 8);
    for (let i = 0; i < pot.cfg.times; i++) {
      pot.update(pot.cfg.heatSec);
      pot.addColdWater();
    }
    expect(pot.update(pot.cfg.floatSec + 0.1)).toBe('mushy');
    expect(pot.state).toBe('empty');
    expect(pot.count).toBe(0);
  });
});
