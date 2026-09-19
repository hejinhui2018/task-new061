import { describe, expect, it } from 'vitest';
import type { Segment } from './types';
import { DEFAULT_ISSUE_OPTIONS } from './types';
import { previewOperation, summarizeIssues } from './impact';
import { detectIssues } from './issues';

const seg = (id: string, start: number, end: number, speaker = 'A'): Segment => ({
  id,
  start,
  end,
  speaker,
  texts: { zh: '' },
});

describe('previewOperation · 调整前后的影响', () => {
  it('插入延迟：受影响片段正确，新增空白进入 addedIssues', () => {
    const segments = [seg('a', 0, 1000), seg('b', 1500, 2500), seg('c', 3000, 4000)];
    const report = previewOperation(
      segments,
      { type: 'insert-delay', atMs: 1500, deltaMs: 3000 },
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(report.affectedSegmentIds).toEqual(['b', 'c']);
    expect(report.before.gap).toBe(0);
    expect(report.after.gap).toBe(1); // a.end=1000 与 b.start=4500 之间
    expect(report.addedIssues.some((i) => i.kind === 'gap')).toBe(true);
    expect(report.resolvedIssues).toHaveLength(0);
    // 原数组未被修改
    expect(segments[1].start).toBe(1500);
  });

  it('批量平移制造重叠：after 计数与新增问题一致', () => {
    const segments = [seg('a', 0, 2000, 'A'), seg('b', 2500, 3500, 'B')];
    const report = previewOperation(
      segments,
      { type: 'shift-segments', ids: ['b'], deltaMs: -1000 },
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(report.before.overlap).toBe(0);
    expect(report.after.overlap).toBe(1);
    expect(report.addedIssues.filter((i) => i.kind === 'overlap')).toHaveLength(1);
  });

  it('重叠修复预览：重叠被解决，resolvedIssues 记录原问题', () => {
    const segments = [seg('a', 0, 2000, 'A'), seg('b', 1500, 3000, 'B')];
    expect(detectIssues(segments, DEFAULT_ISSUE_OPTIONS)).toHaveLength(1);
    const report = previewOperation(segments, { type: 'repair-overlaps' }, DEFAULT_ISSUE_OPTIONS);
    expect(report.before.overlap).toBe(1);
    expect(report.after.overlap).toBe(0);
    expect(report.resolvedIssues).toHaveLength(1);
    expect(report.addedIssues).toHaveLength(0);
  });

  it('同一说话人平移重叠计入 speakerConflict 而非 overlap', () => {
    const segments = [seg('a', 0, 2000, '甲'), seg('b', 3000, 4000, '甲')];
    const report = previewOperation(
      segments,
      { type: 'shift-segments', ids: ['b'], deltaMs: -1500 },
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(report.after.speakerConflict).toBe(1);
    expect(report.after.overlap).toBe(0);
  });
});

describe('summarizeIssues', () => {
  it('按类别计数并给出总数', () => {
    const segments = [
      seg('a', 0, 2000, '甲'),
      seg('b', 1500, 3000, '乙'),
      seg('c', 9000, 10000, '丙'),
    ];
    const summary = summarizeIssues(detectIssues(segments, DEFAULT_ISSUE_OPTIONS));
    expect(summary.overlap).toBe(1);
    expect(summary.gap).toBe(1);
    expect(summary.speakerConflict).toBe(0);
    expect(summary.total).toBe(2);
  });
});
