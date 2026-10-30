import { describe, expect, it } from 'vitest';
import { Pan } from '../src/pan';

// 排好 n 顆、蓋鍋、蒸完，停在收乾的第 0 秒
function panReadyToCrisp(n = 20) {
  const pan = new Pan();
  pan.add(n);
  pan.cover();
  pan.update(pan.cfg.steamSec);
  return pan;
}

describe('排鍋', () => {
  it('最多放到鍋子容量', () => {
    const pan = new Pan();
    const cap = pan.cfg.capacity;
    expect(pan.add(cap - 5)).toBe(cap - 5);
    expect(pan.add(10)).toBe(5);
    expect(pan.count).toBe(cap);
    expect(pan.state).toBe('loaded');
  });

  it('拿光了回到空鍋', () => {
    const pan = new Pan();
    pan.add(3);
    expect(pan.remove(5)).toBe(3);
    expect(pan.state).toBe('empty');
  });

  it('空鍋不能蓋鍋', () => {
    expect(new Pan().cover()).toBe(false);
  });

  it('開始煎之後就不能再加', () => {
    const pan = new Pan();
    pan.add(10);
    pan.cover();
    expect(pan.add(5)).toBe(0);
    expect(pan.count).toBe(10);
  });
});

describe('蒸', () => {
  it('蒸滿時間才開蓋收乾', () => {
    const pan = new Pan();
    pan.add(10);
    pan.cover();
    pan.update(pan.cfg.steamSec - 1);
    expect(pan.state).toBe('steaming');
    pan.update(1);
    expect(pan.state).toBe('crisping');
  });

  it('蒸的時候不能鏟', () => {
    const pan = new Pan();
    pan.add(10);
    pan.cover();
    expect(pan.scoop()).toBeNull();
  });
});

describe('收乾判定', () => {
  it.each([
    [2, 70], // 太早：偏生
    [4, 100], // 完美時間窗開始
    [6, 100],
    [8, 100], // 完美時間窗結束
    [9, 80], // 太晚：偏焦
  ])('收乾第 %i 秒鏟出，品質 %i', (sec, quality) => {
    const pan = panReadyToCrisp();
    pan.update(sec);
    expect(pan.scoop()).toEqual({ count: 20, quality });
    expect(pan.state).toBe('empty');
    expect(pan.count).toBe(0);
  });
});

describe('燒焦', () => {
  it('收乾超過時間就燒焦，那一刻回報燒掉幾顆', () => {
    const pan = panReadyToCrisp(20);
    expect(pan.update(pan.cfg.crispSec)).toBe(0);
    expect(pan.update(0.1)).toBe(20);
    expect(pan.state).toBe('burnt');
    expect(pan.scoop()).toBeNull();
  });

  it('燒焦只回報一次', () => {
    const pan = panReadyToCrisp(20);
    pan.update(pan.cfg.crispSec + 1);
    expect(pan.update(1)).toBe(0);
  });

  it('清鍋要等清完才能再排', () => {
    const pan = panReadyToCrisp();
    pan.update(pan.cfg.crispSec + 1);
    expect(pan.add(5)).toBe(0);
    expect(pan.clean()).toBe(true);
    expect(pan.state).toBe('cleaning');
    pan.update(pan.cfg.cleanSec);
    expect(pan.state).toBe('empty');
    expect(pan.add(5)).toBe(5);
  });
});
