import { describe, expect, it } from 'vitest';
import type { Segment } from './types';
import { DEFAULT_ISSUE_OPTIONS } from './types';
import { detectIssues } from './issues';
import {
  moveSegmentTo,
  removeSegment,
  repairOverlaps,
  retimeSegment,
  shiftSegmentIds,
  shiftSegmentsAfter,
  splitSegment,
  splitText,
  updateSegmentSpeaker,
  updateSegmentText,
} from './operations';

const seg = (id: string, start: number, end: number, speaker = 'A', text = ''): Segment => ({
  id,
  start,
  end,
  speaker,
  texts: { zh: text },
});

describe('相邻边界', () => {
  it('end === start 的相邻片段既不算重叠也不算空白', () => {
    const segments = [seg('a', 0, 1000), seg('b', 1000, 2000)];
    const issues = detectIssues(segments, DEFAULT_ISSUE_OPTIONS);
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
    expect(issues.filter((i) => i.kind === 'speaker-conflict')).toHaveLength(0);
    expect(issues.filter((i) => i.kind === 'gap')).toHaveLength(0);
  });

  it('在边界点插入延迟只影响边界及之后的片段', () => {
    const segments = [seg('a', 0, 1000), seg('b', 1000, 2000)];
    const shifted = shiftSegmentsAfter(segments, 1000, 500);
    expect(shifted[0]).toMatchObject({ start: 0, end: 1000 });
    expect(shifted[1]).toMatchObject({ start: 1500, end: 2500 });
  });

  it('边界插入负延迟产生重叠，能被检测到', () => {
    const segments = [seg('a', 0, 1000, 'A'), seg('b', 1000, 2000, 'B')];
    const shifted = shiftSegmentsAfter(segments, 1000, -300);
    const issues = detectIssues(shifted, DEFAULT_ISSUE_OPTIONS);
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(1);
  });
});

describe('连锁平移（插入延迟）', () => {
  const segments = [
    seg('a', 0, 1000),
    seg('b', 1500, 2500),
    seg('c', 3000, 4000),
    seg('d', 4500, 5000),
  ];

  it('插入点之后的片段整体平移，相对间隔保持不变', () => {
    const shifted = shiftSegmentsAfter(segments, 3000, 1500);
    expect(shifted.map((s) => [s.start, s.end])).toEqual([
      [0, 1000],
      [1500, 2500],
      [4500, 5500],
      [6000, 6500],
    ]);
    // 相对间隔保持
    expect(shifted[3].start - shifted[2].start).toBe(1500);
    expect(shifted[2].start - shifted[1].start).toBe(3000);
  });

  it('不修改原数组（纯函数）', () => {
    shiftSegmentsAfter(segments, 3000, 1500);
    expect(segments[2].start).toBe(3000);
  });

  it('连锁平移后在插入点产生可检测的空白', () => {
    // c/d 后移 2000ms：b.end=2500 与 c.start=5000 之间出现 2500ms 空白（阈值 2000）
    const shifted = shiftSegmentsAfter(segments, 3000, 2000);
    const gaps = detectIssues(shifted, DEFAULT_ISSUE_OPTIONS).filter((i) => i.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].segmentIds).toEqual(['b', 'c']);
    expect(gaps[0].at).toBe(2500);
  });
});

describe('批量平移', () => {
  it('只移动指定片段，保持时长', () => {
    const segments = [seg('a', 0, 1000), seg('b', 1500, 2500), seg('c', 3000, 4000)];
    const shifted = shiftSegmentIds(segments, ['a', 'c'], 500);
    expect(shifted.map((s) => [s.start, s.end])).toEqual([
      [500, 1500],
      [1500, 2500],
      [3500, 4500],
    ]);
  });
});

describe('重叠修复', () => {
  it('前段被截到后段起点，修复后无重叠', () => {
    const segments = [seg('a', 0, 2000), seg('b', 1500, 3000), seg('c', 2900, 4000)];
    const { segments: fixed, trimmed, removedIds } = repairOverlaps(segments);
    expect(fixed.find((s) => s.id === 'a')?.end).toBe(1500);
    expect(fixed.find((s) => s.id === 'b')?.end).toBe(2900);
    expect(fixed.find((s) => s.id === 'c')?.end).toBe(4000);
    expect(trimmed.map((t) => t.id)).toEqual(['a', 'b']);
    expect(removedIds).toHaveLength(0);
    expect(detectIssues(fixed, DEFAULT_ISSUE_OPTIONS).filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });

  it('包含关系：外层被截短，内层完整保留', () => {
    const segments = [seg('outer', 0, 5000), seg('inner', 1000, 2000)];
    const { segments: fixed, removedIds } = repairOverlaps(segments);
    expect(fixed.find((s) => s.id === 'outer')?.end).toBe(1000);
    expect(fixed.find((s) => s.id === 'inner')).toMatchObject({ start: 1000, end: 2000 });
    expect(removedIds).toHaveLength(0);
  });

  it('截短后不足 1ms 的片段被移除，且不影响更早的片段', () => {
    // 同起点时短的 c 排在 b 前：a 先被截到 c 的起点；b 再把 c 截空（移除），自身完整保留
    const segments = [seg('a', 0, 5000), seg('b', 1000, 2000), seg('c', 1000, 1500)];
    const { segments: fixed, removedIds } = repairOverlaps(segments);
    expect(removedIds).toEqual(['c']);
    expect(fixed.map((s) => [s.id, s.start, s.end])).toEqual([
      ['a', 0, 1000],
      ['b', 1000, 2000],
    ]);
    expect(detectIssues(fixed, DEFAULT_ISSUE_OPTIONS).filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });

  it('完全相同起点的片段：先到的被移除，结果确定', () => {
    const segments = [seg('a', 1000, 2000), seg('b', 1000, 3000)];
    const { segments: fixed, removedIds } = repairOverlaps(segments);
    expect(removedIds).toEqual(['a']);
    expect(fixed.map((s) => s.id)).toEqual(['b']);
  });

  it('不修改原数组', () => {
    const segments = [seg('a', 0, 2000), seg('b', 1500, 3000)];
    repairOverlaps(segments);
    expect(segments[0].end).toBe(2000);
  });
});

describe('拆分片段', () => {
  const segments: Segment[] = [
    { id: 'x', start: 1000, end: 3000, speaker: 'A', texts: { zh: '你好世界', en: 'hello world' } },
  ];

  it('在中点拆分：时间对半、说话人保留、文本按比例分配', () => {
    const out = splitSegment(segments, 'x', 2000);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'x', start: 1000, end: 2000, speaker: 'A' });
    expect(out[1]).toMatchObject({ id: 'x-b', start: 2000, end: 3000, speaker: 'A' });
    expect(out[0].texts.zh).toBe('你好');
    expect(out[1].texts.zh).toBe('世界');
    expect(out[0].texts.en).toBe('hello');
    expect(out[1].texts.en).toBe('world');
  });

  it('拆分点在片段外或 id 不存在时原样返回', () => {
    expect(splitSegment(segments, 'x', 500)).toBe(segments);
    expect(splitSegment(segments, 'x', 3000)).toBe(segments);
    expect(splitSegment(segments, 'nope', 1500)).toBe(segments);
  });

  it('重复拆分生成不重复的 id', () => {
    const once = splitSegment(segments, 'x', 2000);
    const twice = splitSegment(once, 'x', 1500);
    const ids = twice.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('x-b2');
  });
});

describe('splitText', () => {
  it('优先在空白边界切分', () => {
    expect(splitText('aaaa bbbb cccc', 0.5)).toEqual(['aaaa', 'bbbb cccc']);
  });

  it('无空白时硬切', () => {
    expect(splitText('你好世界', 0.5)).toEqual(['你好', '世界']);
  });

  it('比例越界时安全处理', () => {
    expect(splitText('abc', 0)).toEqual(['', 'abc']);
    expect(splitText('abc', 1)).toEqual(['abc', '']);
  });
});

describe('其他基础操作', () => {
  it('moveSegmentTo 保持时长', () => {
    const out = moveSegmentTo([seg('a', 0, 1000)], 'a', 2500);
    expect(out[0]).toMatchObject({ start: 2500, end: 3500 });
  });

  it('retimeSegment 拒绝 end <= start', () => {
    const segments = [seg('a', 0, 1000)];
    expect(retimeSegment(segments, 'a', 900, 900)).toBe(segments);
    expect(retimeSegment(segments, 'a', 0, 1200)[0].end).toBe(1200);
  });

  it('文本 / 说话人 / 删除', () => {
    const segments = [seg('a', 0, 1000, 'A', '旧')];
    expect(updateSegmentText(segments, 'a', 'en', 'new')[0].texts.en).toBe('new');
    expect(updateSegmentSpeaker(segments, 'a', 'B')[0].speaker).toBe('B');
    expect(removeSegment(segments, 'a')).toHaveLength(0);
  });
});
