import { describe, expect, it } from 'vitest';
import { exportProjectJson, exportSrt, importTranscript, parseSrt } from './codec';
import type { Transcript } from './types';

const valid: Transcript = {
  speakers: [{ id: 'a', name: 'Alice', color: '#fff' }],
  cues: [
    { id: 'c1', start: 0, end: 1000, speakerId: 'a', text: { en: 'hello', zh: '你好' } },
    { id: 'c2', start: 1500, end: 2500, speakerId: 'a', text: { en: 'world' } },
  ],
};

describe('importTranscript', () => {
  it('接受数字毫秒时间码', () => {
    const t = importTranscript(JSON.parse(JSON.stringify(valid)));
    expect(t.cues).toHaveLength(2);
    expect(t.cues[0].start).toBe(0);
  });

  it('接受字符串时间码', () => {
    const payload = {
      speakers: [{ id: 'a', name: 'Alice' }],
      cues: [{ id: 'x', start: '00:00:01,500', end: '00:01:02.000', speakerId: 'a', text: { en: 'hi' } }],
    };
    const t = importTranscript(payload);
    expect([t.cues[0].start, t.cues[0].end]).toEqual([1500, 62_000]);
  });

  it('text 为字符串时归入源语言并自动排序', () => {
    const t = importTranscript({
      cues: [
        { id: 'b', start: 2000, end: 3000, text: 'later' },
        { id: 'a', start: 0, end: 1000, text: 'first' },
      ],
    });
    expect(t.cues.map((c) => c.id)).toEqual(['a', 'b']);
    expect(t.cues[0].text.en).toBe('first');
  });

  it.each([
    ['空对象', {}],
    ['cues 为空', { cues: [] }],
    ['end 早于 start', { cues: [{ start: 1000, end: 500, text: 'x' }] }],
    ['时间码缺失', { cues: [{ start: 1000, text: 'x' }] }],
    ['非法时间码', { cues: [{ start: 'nope', end: 500, text: 'x' }] }],
    ['ID 重复', { cues: [{ id: 'c', start: 0, end: 100, text: 'x' }, { id: 'c', start: 200, end: 300, text: 'y' }] }],
  ])('拒绝非法输入：%s', (_name, payload) => {
    expect(() => importTranscript(payload)).toThrow();
  });
});

describe('导出往返', () => {
  it('项目 JSON 往返保持全部语言', () => {
    const raw = exportProjectJson(valid);
    const t = importTranscript(JSON.parse(raw));
    expect(t.cues[0].text.zh).toBe('你好');
    expect(t.speakers[0].name).toBe('Alice');
  });

  it('SRT 导出使用逗号时间码并带发言人前缀', () => {
    const srt = exportSrt(valid, 'zh');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,000');
    expect(srt).toContain('Alice: 你好');
  });

  it('SRT 解析往返（发言人前缀识别）', () => {
    const srt = exportSrt(valid, 'en');
    const t = parseSrt(srt);
    expect(t.cues).toHaveLength(2);
    expect(t.cues[0].speakerId).toBe('spk-alice');
    expect(t.speakers[0].name).toBe('Alice');
    expect(t.cues[0].text.en).toBe('hello');
  });
});
