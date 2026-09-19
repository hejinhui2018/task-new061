import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  diffVersions,
  findVersion,
  listVersions,
  redo,
  restoreHistory,
  restoreVersion,
  serializeHistory,
  undo,
} from './history';
import { insertDelay } from './ops';
import type { Transcript } from './types';

function sample(): Transcript {
  return {
    speakers: [{ id: 'a', name: 'A', color: '#000' }],
    cues: [
      { id: 'c1', start: 0, end: 1000, speakerId: 'a', text: { en: 'one', zh: '一' } },
      { id: 'c2', start: 1000, end: 2000, speakerId: 'a', text: { en: 'two', zh: '二' } },
    ],
  };
}

/** 可注入的手动时钟 */
function fakeClock(start = 1_000_000): () => number {
  let t = start;
  return () => (t += 1000);
}

describe('createHistory / 注入时钟', () => {
  it('初始版本使用注入的 now 作为时间戳', () => {
    const h = createHistory(sample(), { now: 4242, label: '起点' });
    expect(h.present.versionId).toBe('v1');
    expect(h.present.createdAt).toBe(4242);
    expect(h.present.label).toBe('起点');
    expect(canUndo(h)).toBe(false);
  });

  it('提交时使用注入时钟打时间戳并深拷贝快照', () => {
    const clock = fakeClock();
    const t = sample();
    let h = createHistory(t, { clock });
    const shifted = insertDelay(t.cues, 500, 200).cues;
    h = commit(h, { ...t, cues: shifted }, '插入延迟 200ms', clock);
    expect(h.present.createdAt).toBe(1_002_000);
    expect(h.present.label).toBe('插入延迟 200ms');
    // 继续篡改调用方对象，历史快照不受影响
    shifted[0].start = 999_999;
    expect(h.present.transcript.cues[0].start).not.toBe(999_999);
  });
});

describe('undo / redo', () => {
  it('撤销后重做能还原，提交新版本会清空 redo 分支', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock });
    const v2 = insertDelay(sample().cues, 0, 100).cues;
    h = commit(h, { ...sample(), cues: v2 }, 'v2', clock);
    const v3 = insertDelay(h.present.transcript.cues, 0, 100).cues;
    h = commit(h, { ...h.present.transcript, cues: v3 }, 'v3', clock);
    expect(h.present.versionId).toBe('v3');

    h = undo(h);
    expect(h.present.versionId).toBe('v2');
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(true);

    h = undo(h);
    expect(h.present.versionId).toBe('v1');
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present.versionId).toBe('v2');

    // 在 v2 上提交新编辑 → v3 的 redo 分支被丢弃
    const branch = insertDelay(h.present.transcript.cues, 0, 50).cues;
    h = commit(h, { ...h.present.transcript, cues: branch }, 'v2 分支', clock);
    expect(canRedo(h)).toBe(false);
    expect(h.present.label).toBe('v2 分支');
  });

  it('到边界时 undo/redo 返回原状态', () => {
    const h = createHistory(sample());
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});

describe('版本上限', () => {
  it('超出 maxEntries 时丢弃最旧版本', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock, maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      h = commit(h, { ...h.present.transcript, cues: insertDelay(h.present.transcript.cues, 0, 10).cues }, `第${i + 1}次`, clock, 3);
    }
    expect(listVersions(h)).toHaveLength(3);
    expect(listVersions(h)[0].label).toBe('第3次');
  });
});

describe('restoreVersion 版本恢复', () => {
  it('恢复旧版本会产生带标注的新版本，且可撤销回恢复前', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock });
    h = commit(h, { ...sample(), cues: insertDelay(sample().cues, 0, 100).cues }, '后移 100', clock);
    h = commit(h, { ...h.present.transcript, cues: insertDelay(h.present.transcript.cues, 0, 100).cues }, '再后移 100', clock);
    const before = h.present.transcript.cues[0].start;
    expect(before).toBe(200);

    h = restoreVersion(h, 'v1', clock);
    expect(h.present.transcript.cues[0].start).toBe(0);
    expect(h.present.label).toContain('恢复自 v1');
    expect(h.present.versionId).toBe('v4'); // 线性新版本，不是直接回跳

    h = undo(h);
    expect(h.present.transcript.cues[0].start).toBe(200);
  });

  it('恢复当前版本是空操作，恢复不存在的版本抛错', () => {
    const h = createHistory(sample());
    expect(restoreVersion(h, 'v1')).toBe(h);
    expect(() => restoreVersion(h, 'vX')).toThrow(/找不到版本/);
  });
});

describe('diffVersions 版本对比', () => {
  it('识别时间码变化、新增与删除', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock });
    const moved = insertDelay(sample().cues, 1000, 300);
    h = commit(h, { ...h.present.transcript, cues: moved.cues }, 'c2 后移 300', clock);
    const v1 = findVersion(h, 'v1')!;
    const diff = diffVersions(v1, h.present);
    expect(diff.added).toBe(0);
    expect(diff.modified).toBe(1);
    const change = diff.changes[0];
    expect(change.id).toBe('c2');
    expect(change.time?.before).toEqual({ start: 1000, end: 2000 });
    expect(change.time?.after).toEqual({ start: 1300, end: 2300 });
  });

  it('识别文本与发言人变化', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock });
    const edited: Transcript = JSON.parse(JSON.stringify(sample()));
    edited.cues[0].text.zh = '壹';
    edited.cues[0].speakerId = 'b';
    h = commit(h, edited, '改译文与发言人', clock);
    const diff = diffVersions(findVersion(h, 'v1')!, h.present);
    const c1 = diff.changes.find((c) => c.id === 'c1')!;
    expect(c1.speaker).toEqual({ before: 'a', after: 'b' });
    expect(c1.texts.find((t) => t.language === 'zh')).toMatchObject({ before: '一', after: '壹' });
  });
});

describe('序列化 / 刷新恢复', () => {
  it('序列化后恢复得到等价历史，撤销栈不丢', () => {
    const clock = fakeClock();
    let h = createHistory(sample(), { clock });
    h = commit(h, { ...sample(), cues: insertDelay(sample().cues, 0, 100).cues }, '编辑', clock);
    const raw = serializeHistory(h, clock);
    const restored = restoreHistory(raw)!;
    expect(restored).not.toBeNull();
    expect(restored.present.versionId).toBe('v2');
    expect(restored.past).toHaveLength(1);
    expect(canUndo(restored)).toBe(true);
    expect(undo(restored).present.transcript.cues[0].start).toBe(0);
  });

  it.each([
    ['不是 JSON', '{broken'],
    ['缺 version', JSON.stringify({ history: {} })],
    ['present 损坏', JSON.stringify({ version: 1, history: { present: {} } })],
    ['cues 不是数组', JSON.stringify({ version: 1, history: { present: { transcript: { cues: {} } }, past: [], future: [] } })],
  ])('损坏数据 %s 恢复为 null', (_name, raw) => {
    expect(restoreHistory(raw)).toBeNull();
  });
});
