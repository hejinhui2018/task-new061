import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
} from './history';

const entry = (state: number, label = `op-${state}`) => ({ state, label, at: state * 1000 });

describe('history · 撤销/重做', () => {
  it('提交、撤销、重做的完整链路', () => {
    let h = initHistory(entry(0, 'init'));
    h = pushHistory(h, entry(1));
    h = pushHistory(h, entry(2));
    expect(h.present.state).toBe(2);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present.state).toBe(1);
    expect(canRedo(h)).toBe(true);

    h = undo(h);
    expect(h.present.state).toBe(0);
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present.state).toBe(1);
    h = redo(h);
    expect(h.present.state).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  it('撤销后再提交会清空 future（不能重放到旧分支）', () => {
    let h = initHistory(entry(0));
    h = pushHistory(h, entry(1));
    h = undo(h);
    h = pushHistory(h, entry(5));
    expect(h.future).toHaveLength(0);
    expect(h.present.state).toBe(5);
  });

  it('空栈上撤销/重做是安全的无操作', () => {
    const h = initHistory(entry(0));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('历史长度受 limit 约束，最旧的被丢弃', () => {
    let h = initHistory(entry(0));
    for (let i = 1; i <= 150; i++) h = pushHistory(h, entry(i), 100);
    expect(h.past.length).toBe(100);
    // past = [50..149]，一路撤销到底，最早只能回到 state=50
    for (let i = 0; i < 200; i++) h = undo(h);
    expect(h.present.state).toBe(50);
  });

  it('记录操作标签与时间（供 UI 展示“撤销：插入延迟”）', () => {
    let h = initHistory(entry(0, 'init'));
    h = pushHistory(h, { state: 1, label: '插入延迟', at: 42 });
    expect(h.present.label).toBe('插入延迟');
    expect(h.present.at).toBe(42);
  });
});
