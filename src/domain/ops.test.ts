import { describe, expect, it } from 'vitest';
import {
  MIN_DURATION,
  batchShift,
  changeSpeaker,
  insertDelay,
  moveCue,
  repairOverlap,
  splitCue,
  trimCue,
} from './ops';
import type { Cue } from './types';

function makeCues(): Cue[] {
  return [
    { id: 'c1', start: 0, end: 1000, speakerId: 'a', text: { en: 'one', zh: '一', es: 'uno' } },
    { id: 'c2', start: 1000, end: 2000, speakerId: 'b', text: { en: 'two words here', zh: '两个词在这里', es: 'dos palabras aquí' } },
    { id: 'c3', start: 2000, end: 3000, speakerId: 'a', text: { en: 'three', zh: '三', es: 'tres' } },
  ];
}

describe('moveCue', () => {
  it('保持时长整体移动并默认 10ms 吸附', () => {
    const result = moveCue(makeCues(), 'c2', 1234);
    const c2 = result.cues.find((c) => c.id === 'c2')!;
    expect([c2.start, c2.end]).toEqual([1230, 2230]);
    const hit = result.impacted.find((i) => i.id === 'c2');
    expect(hit?.before).toEqual({ start: 1000, end: 2000 });
    expect(hit?.after).toEqual({ start: 1230, end: 2230 });
  });

  it('constrain 模式不允许越过邻居造成重叠', () => {
    const result = moveCue(makeCues(), 'c2', 5000, { constrain: true });
    const c2 = result.cues.find((c) => c.id === 'c2')!;
    // c3.start(2000) - duration(1000) = 1000，被钳回原位
    expect([c2.start, c2.end]).toEqual([1000, 2000]);
  });

  it('向左移动不会早于 0', () => {
    const result = moveCue(makeCues(), 'c1', -500);
    const c1 = result.cues.find((c) => c.id === 'c1')!;
    expect([c1.start, c1.end]).toEqual([0, 1000]);
  });

  it('不修改原数组（不可变）', () => {
    const cues = makeCues();
    moveCue(cues, 'c2', 1500);
    expect(cues[1].start).toBe(1000);
  });
});

describe('trimCue 边缘调整', () => {
  it('拖动入点并吸附', () => {
    const result = trimCue(makeCues(), 'c2', 'start', 1124);
    expect(result.cues.find((c) => c.id === 'c2')!.start).toBe(1120);
  });

  it('入点不能逼近到短于最短时长', () => {
    const result = trimCue(makeCues(), 'c2', 'start', 1990);
    const c2 = result.cues.find((c) => c.id === 'c2')!;
    expect(c2.end - c2.start).toBeGreaterThanOrEqual(MIN_DURATION);
    expect(c2.start).toBe(2000 - MIN_DURATION);
  });

  it('出点不能早于入点加最短时长', () => {
    const result = trimCue(makeCues(), 'c1', 'end', 10);
    const c1 = result.cues.find((c) => c.id === 'c1')!;
    expect(c1.end - c1.start).toBe(MIN_DURATION);
  });
});

describe('splitCue', () => {
  it('在中间拆分：前段收边、新段从切点开始且发言人一致', () => {
    const result = splitCue(makeCues(), 'c2', 1500, () => 'c2b');
    const ordered = result.cues;
    const first = ordered.find((c) => c.id === 'c2')!;
    const second = ordered.find((c) => c.id === 'c2b')!;
    expect([first.start, first.end]).toEqual([1000, 1500]);
    expect([second.start, second.end]).toEqual([1500, 2000]);
    expect(first.end).toBe(second.start); // 相邻边界，不重叠
    expect(second.speakerId).toBe('b');
    expect(first.text.en + ' ' + second.text.en).toBe('two words here');
    expect(first.text.zh + second.text.zh).toBe('两个词在这里');
    // 影响列表标注新增
    expect(result.impacted.find((i) => i.id === 'c2b')?.added).toBe(true);
  });

  it('切点过近会被钳制，保证两段都不短于最短时长', () => {
    const result = splitCue(makeCues(), 'c2', 1010, () => 'c2b');
    const first = result.cues.find((c) => c.id === 'c2')!;
    expect(first.end - first.start).toBeGreaterThanOrEqual(MIN_DURATION);
  });

  it('找不到片段抛错', () => {
    expect(() => splitCue(makeCues(), 'nope', 1500, () => 'x')).toThrow();
  });
});

describe('insertDelay — 连锁平移', () => {
  it('在指定时刻之后的所有片段整体后移，时刻点之前/包含时刻起点的边界语义正确', () => {
    // at=2000：start >= 2000 的是 c3（以及边界恰好在 2000 的 c2? c2.start=1000 不受影响）
    const result = insertDelay(makeCues(), 2000, 500);
    expect(result.cues.find((c) => c.id === 'c1')!.start).toBe(0);
    expect(result.cues.find((c) => c.id === 'c2')!.start).toBe(1000);
    const c3 = result.cues.find((c) => c.id === 'c3')!;
    expect([c3.start, c3.end]).toEqual([2500, 3500]);
  });

  it('在 c2 起点前插入 500ms：c2、c3 连锁后移，间距保持不变', () => {
    const result = insertDelay(makeCues(), 1000, 500);
    const c2 = result.cues.find((c) => c.id === 'c2')!;
    const c3 = result.cues.find((c) => c.id === 'c3')!;
    expect([c2.start, c2.end]).toEqual([1500, 2500]);
    expect([c3.start, c3.end]).toEqual([2500, 3500]);
    expect(c2.end).toBe(c3.start); // 相邻关系不被破坏
  });

  it('影响列表精确列出每个平移片段的前后时间', () => {
    const result = insertDelay(makeCues(), 1000, 500);
    expect(result.impacted.map((i) => i.id)).toEqual(['c2', 'c3']);
    for (const hit of result.impacted) {
      expect(hit.after!.start - hit.before!.start).toBe(500);
    }
  });

  it('拒绝负延迟', () => {
    expect(() => insertDelay(makeCues(), 1000, -100)).toThrow();
  });
});

describe('batchShift', () => {
  it('从某条起及其后全部平移', () => {
    const result = batchShift(makeCues(), { fromId: 'c2', deltaMs: 250 });
    expect(result.cues.find((c) => c.id === 'c1')!.start).toBe(0);
    expect(result.cues.find((c) => c.id === 'c2')!.start).toBe(1250);
    expect(result.cues.find((c) => c.id === 'c3')!.start).toBe(2250);
  });

  it('负向平移被钳制，任何片段都不会早于 0', () => {
    const result = batchShift(makeCues(), { deltaMs: -5000 });
    for (const cue of result.cues) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
    }
    // 最早的 c1 被钳在 0，整体只移动了 0
    expect(result.cues.find((c) => c.id === 'c1')!.start).toBe(0);
  });

  it('按指定 id 集合平移', () => {
    const result = batchShift(makeCues(), { ids: ['c1', 'c3'], deltaMs: 100 });
    expect(result.cues.find((c) => c.id === 'c1')!.start).toBe(100);
    expect(result.cues.find((c) => c.id === 'c2')!.start).toBe(1000);
    expect(result.cues.find((c) => c.id === 'c3')!.start).toBe(2100);
  });
});

describe('repairOverlap', () => {
  function overlapping(): Cue[] {
    // c2 与 c3 重叠 300ms
    return [
      { id: 'c1', start: 0, end: 1000, speakerId: 'a', text: { en: 'one' } },
      { id: 'c2', start: 1000, end: 2000, speakerId: 'b', text: { en: 'two' } },
      { id: 'c3', start: 1700, end: 2700, speakerId: 'a', text: { en: 'three' } },
    ];
  }

  it('trim 模式：把后一条入点裁到前一条出点，消除重叠', () => {
    const result = repairOverlap(overlapping(), 'c3', 'trim');
    const c3 = result.cues.find((c) => c.id === 'c3')!;
    expect(c3.start).toBe(2000);
    expect(c3.end).toBe(2700);
  });

  it('ripple 模式：保持时长右移并连锁推开后续片段', () => {
    const cues = overlapping();
    // 再加一条 c4，验证连锁：c3 右移后会撞到 c4
    cues.push({ id: 'c4', start: 2700, end: 3500, speakerId: 'b', text: { en: 'four' } });
    const result = repairOverlap(cues, undefined, 'ripple');
    const byId = (id: string) => result.cues.find((c) => c.id === id)!;
    expect([byId('c3').start, byId('c3').end]).toEqual([2000, 3000]);
    expect([byId('c4').start, byId('c4').end]).toEqual([3000, 3800]); // 被连锁推开 300ms
    // 全部相邻无重叠
    const ordered = result.cues;
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(ordered[i + 1].start).toBeGreaterThanOrEqual(ordered[i].end);
    }
  });

  it('trim 后短于最短时长时自动延长出点', () => {
    const cues: Cue[] = [
      { id: 'a', start: 0, end: 1000, speakerId: 'x', text: { en: 'a' } },
      { id: 'b', start: 900, end: 1050, speakerId: 'x', text: { en: 'b' } },
    ];
    const result = repairOverlap(cues, 'b', 'trim');
    const b = result.cues.find((c) => c.id === 'b')!;
    expect(b.end - b.start).toBeGreaterThanOrEqual(MIN_DURATION);
    expect(b.start).toBe(1000);
    expect(b.end).toBe(1000 + MIN_DURATION);
  });
});

describe('changeSpeaker', () => {
  it('更换发言人标签', () => {
    const result = changeSpeaker(makeCues(), 'c2', 'a');
    expect(result.cues.find((c) => c.id === 'c2')!.speakerId).toBe('a');
  });
});
