import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatDelta,
  formatDuration,
  formatTimecode,
  overlapAmount,
  parseTimecode,
  snap,
} from './time';

describe('parseTimecode', () => {
  it('解析 SRT 完整格式', () => {
    expect(parseTimecode('00:01:02,500')).toBe(62_500);
  });

  it('解析 VTT 点号格式', () => {
    expect(parseTimecode('00:01:02.500')).toBe(62_500);
  });

  it('支持省略小时并对毫秒位补零', () => {
    expect(parseTimecode('01:02,5')).toBe(62_500);
    expect(parseTimecode('00:00.5')).toBe(500);
  });

  it('非法字符串抛出错误', () => {
    expect(() => parseTimecode('not-a-time')).toThrow(/时间码/);
  });
});

describe('formatTimecode', () => {
  it('往返保持一致', () => {
    for (const ms of [0, 1, 250, 59_999, 3_600_000, 3_723_456]) {
      expect(parseTimecode(formatTimecode(ms))).toBe(ms);
    }
  });

  it('支持 VTT 分隔符', () => {
    expect(formatTimecode(62_500, '.')).toBe('00:01:02.500');
  });

  it('负数抛错', () => {
    expect(() => formatTimecode(-1)).toThrow();
  });
});

describe('overlapAmount — 相邻边界', () => {
  it('首尾相接（end == start）不算重叠', () => {
    expect(overlapAmount(0, 1000, 1000, 2000)).toBe(0);
  });

  it('相差 1ms 才算重叠', () => {
    expect(overlapAmount(0, 1001, 1000, 2000)).toBe(1);
  });

  it('完全分离返回 0', () => {
    expect(overlapAmount(0, 500, 1000, 2000)).toBe(0);
  });

  it('包含关系返回内侧长度', () => {
    expect(overlapAmount(0, 2000, 500, 1500)).toBe(1000);
  });
});

describe('数值工具', () => {
  it('clamp 钳制到区间', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('snap 按步长取整', () => {
    expect(snap(123, 10)).toBe(120);
    expect(snap(125, 10)).toBe(130);
    expect(snap(123, 100)).toBe(100);
  });

  it('formatDelta / formatDuration 显示', () => {
    expect(formatDelta(1500)).toBe('+1.50s');
    expect(formatDelta(-400)).toBe('−400ms');
    expect(formatDuration(950)).toBe('950ms');
  });
});
