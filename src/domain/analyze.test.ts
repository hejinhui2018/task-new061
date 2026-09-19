import { describe, expect, it } from 'vitest';
import { analyze, translationOverrun } from './analyze';
import { createSampleTranscript } from './sample';
import type { Cue, Transcript } from './types';

const speakers = [
  { id: 'a', name: 'A', color: '#000' },
  { id: 'b', name: 'B', color: '#fff' },
];

function transcript(cues: Array<Partial<Cue> & { id: string; start: number; end: number }>): Transcript {
  return {
    speakers,
    cues: cues.map((c, i) => ({
      speakerId: c.speakerId ?? (i % 2 === 0 ? 'a' : 'b'),
      text: c.text ?? { en: 'short text', zh: '短句', es: 'texto corto' },
      ...c,
    })) as Cue[],
  };
}

describe('analyze — 相邻边界', () => {
  it('首尾相接不报重叠也不报空白', () => {
    const issues = analyze(transcript([
      { id: '1', start: 0, end: 1000 },
      { id: '2', start: 1000, end: 2000 },
    ]));
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
    expect(issues.filter((i) => i.kind === 'gap')).toHaveLength(0);
  });

  it('间隙严格大于阈值才报 gap，边界相等不报', () => {
    const gapped = transcript([
      { id: '1', start: 0, end: 1000 },
      { id: '2', start: 2201, end: 3000 },
    ]);
    expect(analyze(gapped, { gapThreshold: 1200 }).filter((i) => i.kind === 'gap')).toHaveLength(1);

    const exact = transcript([
      { id: '1', start: 0, end: 1000 },
      { id: '2', start: 2000, end: 3000 },
    ]);
    expect(analyze(exact, { gapThreshold: 1000 }).some((i) => i.kind === 'gap')).toBe(false);
  });

  it('1ms 重叠也要报告并给出重叠量', () => {
    const issues = analyze(transcript([
      { id: '1', start: 0, end: 1001 },
      { id: '2', start: 1000, end: 2000 },
    ]));
    const overlap = issues.find((i) => i.kind === 'overlap');
    expect(overlap?.amount).toBe(1);
    expect(overlap?.cueId).toBe('2');
    expect(overlap?.otherCueId).toBe('1');
  });

  it('嵌套重叠也能发现', () => {
    const issues = analyze(transcript([
      { id: '1', start: 0, end: 5000 },
      { id: '2', start: 1000, end: 2000 },
    ]));
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(1);
  });
});

describe('analyze — 发言人冲突', () => {
  it('相邻两句同发言人提示确认标签', () => {
    const t = transcript([
      { id: '1', start: 0, end: 1000, speakerId: 'a' },
      { id: '2', start: 1000, end: 2000, speakerId: 'a' },
    ]);
    const conflict = analyze(t).find((i) => i.kind === 'speakerConflict');
    expect(conflict).toBeTruthy();
    expect(conflict?.cueId).toBe('2');
  });

  it('跨发言人相邻不提示', () => {
    const t = transcript([
      { id: '1', start: 0, end: 1000, speakerId: 'a' },
      { id: '2', start: 1000, end: 2000, speakerId: 'b' },
    ]);
    expect(analyze(t).some((i) => i.kind === 'speakerConflict')).toBe(false);
  });
});

describe('analyze — 翻译超时', () => {
  it('示例数据中只有 c6 的中文超时', () => {
    const issues = analyze(createSampleTranscript());
    const overruns = issues.filter((i) => i.kind === 'translationOverrun');
    expect(overruns.map((i) => i.cueId)).toEqual(['c6']);
    expect(overruns.map((i) => i.language)).toEqual(['zh']);
  });

  it('预算边界恰好相等时不超时', () => {
    // 3500ms 片段，zh 25 字：需求 25*160=4000；预算 3500*1.2=4200，不超时
    const cue: Cue = {
      id: 'x', start: 0, end: 3500, speakerId: 'a',
      text: { en: 'x', zh: '一二三四五六七八九十一二三四五六七八九十一二三四五', es: 'x' },
    };
    expect(cue.text.zh).toHaveLength(25);
    expect(translationOverrun(cue, 'zh')).toBe(0);
  });

  it('空译文不报超时', () => {
    const cue: Cue = { id: 'x', start: 0, end: 1000, speakerId: 'a', text: { en: 'x', zh: '', es: '' } };
    expect(translationOverrun(cue, 'zh')).toBe(0);
  });
});
