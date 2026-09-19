import { describe, expect, it } from 'vitest';
import type { Segment } from './types';
import { DEFAULT_ISSUE_OPTIONS } from './types';
import { detectIssues } from './issues';

const seg = (id: string, start: number, end: number, speaker = 'A', zh = ''): Segment => ({
  id,
  start,
  end,
  speaker,
  texts: { zh },
});

describe('detectIssues · 重叠与说话人冲突', () => {
  it('不同说话人重叠 → overlap', () => {
    const issues = detectIssues(
      [seg('a', 0, 2000, '甲'), seg('b', 1500, 3000, '乙')],
      DEFAULT_ISSUE_OPTIONS,
    );
    const overlap = issues.filter((i) => i.kind === 'overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0].segmentIds).toEqual(['a', 'b']);
    expect(issues.filter((i) => i.kind === 'speaker-conflict')).toHaveLength(0);
  });

  it('同一说话人重叠 → speaker-conflict（不重复计为 overlap）', () => {
    const issues = detectIssues(
      [seg('a', 0, 2000, '甲'), seg('b', 1500, 3000, '甲')],
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(issues.filter((i) => i.kind === 'speaker-conflict')).toHaveLength(1);
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
  });

  it('一段与多段重叠时逐对报告', () => {
    const issues = detectIssues(
      [seg('a', 0, 5000, '甲'), seg('b', 1000, 2000, '乙'), seg('c', 3000, 4000, '丙')],
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(2);
  });
});

describe('detectIssues · 空白', () => {
  it('间隔恰好等于阈值不算空白，超过才算', () => {
    const at = detectIssues(
      [seg('a', 0, 1000), seg('b', 3000, 4000)],
      DEFAULT_ISSUE_OPTIONS, // 阈值 2000，间隔正好 2000
    );
    expect(at.filter((i) => i.kind === 'gap')).toHaveLength(0);

    const over = detectIssues(
      [seg('a', 0, 1000), seg('b', 3001, 4000)],
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(over.filter((i) => i.kind === 'gap')).toHaveLength(1);
  });

  it('重叠的片段之间不会误报空白', () => {
    const issues = detectIssues(
      [seg('a', 0, 5000), seg('b', 1000, 2000), seg('c', 5500, 6000)],
      { ...DEFAULT_ISSUE_OPTIONS, gapThresholdMs: 400 },
    );
    // a 与 c 间隔 500 > 400 → 一个空白；b 被 a 覆盖，不产生额外空白
    expect(issues.filter((i) => i.kind === 'gap')).toHaveLength(1);
  });
});

describe('detectIssues · 翻译超时（阅读速度）', () => {
  it('超过上限才标记：20 字/秒不标，21 字/秒标记', () => {
    const at20 = detectIssues(
      [seg('a', 0, 1000, 'A', 'x'.repeat(20))],
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(at20.filter((i) => i.kind === 'translation-timeout')).toHaveLength(0);

    const at21 = detectIssues(
      [seg('a', 0, 1000, 'A', 'x'.repeat(21))],
      DEFAULT_ISSUE_OPTIONS,
    );
    const timeouts = at21.filter((i) => i.kind === 'translation-timeout');
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].message).toContain('21.0');
  });

  it('按语言分别检测，空白文本跳过', () => {
    const s: Segment = {
      id: 'a',
      start: 0,
      end: 1000,
      speaker: 'A',
      texts: { zh: '短', en: 'x'.repeat(30), ja: '   ' },
    };
    const issues = detectIssues([s], DEFAULT_ISSUE_OPTIONS).filter(
      (i) => i.kind === 'translation-timeout',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('translation-timeout:a:en');
  });

  it('问题按发生位置排序', () => {
    // 两个相邻片段都翻译超时，问题应按 at 升序输出
    const issues = detectIssues(
      [seg('a', 1000, 2000, 'A', 'x'.repeat(30)), seg('b', 0, 1000, 'A', 'x'.repeat(30))],
      DEFAULT_ISSUE_OPTIONS,
    );
    expect(issues.map((i) => i.at)).toEqual([0, 1000]);
  });
});
