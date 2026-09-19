import { describe, expect, it } from 'vitest';
import { parseImportedSegments, parseSrt, toSrt } from './importers';
import { timecodeToMs } from './timecode';

describe('parseSrt', () => {
  it('解析标准块并提取说话人前缀', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:03,000',
      '主持人: 你好',
      '',
      '2',
      '00:00:04,000 --> 00:00:06,500',
      '林博士: 谢谢',
      '第二行',
      '',
    ].join('\n');
    const segments = parseSrt(srt);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ start: 1000, end: 3000, speaker: '主持人' });
    expect(segments[0].texts.zh).toBe('你好');
    expect(segments[1].texts.zh).toBe('谢谢\n第二行');
  });

  it('无法解析的块静默跳过，没有说话人前缀则为「未知」', () => {
    const srt = ['垃圾块没有时间轴', '', '3', '00:00:01,000 --> 00:00:02,000', '没有前缀'].join('\n');
    const segments = parseSrt(srt);
    expect(segments).toHaveLength(1);
    expect(segments[0].speaker).toBe('未知');
  });

  it('toSrt 与 parseSrt 往返一致', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:03,000', '主持人: 你好', '', '2', '00:00:04,000 --> 00:00:06,500', '林博士: 谢谢', ''].join('\n');
    const roundTrip = toSrt(parseSrt(srt), 'zh');
    const again = parseSrt(roundTrip);
    expect(again.map((s) => [s.start, s.end, s.speaker, s.texts.zh])).toEqual([
      [1000, 3000, '主持人', '你好'],
      [4000, 6500, '林博士', '谢谢'],
    ]);
  });
});

describe('parseImportedSegments', () => {
  it('接受时间码字符串或毫秒数，texts 或单 text', () => {
    const segments = parseImportedSegments([
      { start: '00:00:01,000', end: '00:00:02,500', speaker: 'A', texts: { zh: '你好', en: 'hi' } },
      { start: 3000, end: 4000, speaker: 'B', text: '纯文本' },
    ]);
    expect(segments[0]).toMatchObject({ start: 1000, end: 2500, speaker: 'A' });
    expect(segments[0].texts).toEqual({ zh: '你好', en: 'hi' });
    expect(segments[1].texts.zh).toBe('纯文本');
    expect(segments[1].id).toBe('imp-2');
  });

  it('重复 id 自动去重', () => {
    const segments = parseImportedSegments([
      { id: 'x', start: 0, end: 1, speaker: 'A' },
      { id: 'x', start: 1, end: 2, speaker: 'A' },
    ]);
    expect(segments.map((s) => s.id)).toEqual(['x', 'x-2']);
  });

  it('非法输入抛出中文错误', () => {
    expect(() => parseImportedSegments({ nope: 1 })).toThrow('数组');
    expect(() => parseImportedSegments([{ start: 'x', end: 1 }])).toThrow('时间码无效');
    expect(() => parseImportedSegments([{ start: 5, end: 1 }])).toThrow('结束时间');
    expect(() => parseImportedSegments([42])).toThrow('不是对象');
  });
});

describe('timecodeToMs 与导入联动', () => {
  it('SRT 常用格式都能解析', () => {
    expect(timecodeToMs('00:00:04,000')).toBe(4000);
    expect(timecodeToMs('01:23:45,678')).toBe(5025678);
  });
});
