import { describe, expect, it } from 'vitest';
import { formatDuration, msToTimecode, timecodeToMs } from './timecode';

describe('msToTimecode', () => {
  it('格式化常见值', () => {
    expect(msToTimecode(0)).toBe('00:00:00,000');
    expect(msToTimecode(1500)).toBe('00:00:01,500');
    expect(msToTimecode(3723456)).toBe('01:02:03,456');
    expect(msToTimecode(36000000)).toBe('10:00:00,000');
  });

  it('负数带符号前缀', () => {
    expect(msToTimecode(-1500)).toBe('-00:00:01,500');
  });

  it('与 timecodeToMs 往返一致', () => {
    for (const ms of [0, 1, 999, 1000, 61000, 3723456, 86399999]) {
      expect(timecodeToMs(msToTimecode(ms))).toBe(ms);
    }
  });
});

describe('timecodeToMs', () => {
  it('解析完整时间码（逗号与点两种毫秒分隔符）', () => {
    expect(timecodeToMs('01:02:03,456')).toBe(3723456);
    expect(timecodeToMs('01:02:03.456')).toBe(3723456);
  });

  it('解析省略小时的写法', () => {
    expect(timecodeToMs('02:03,500')).toBe(123500);
    expect(timecodeToMs('1:02')).toBe(62000);
  });

  it('解析裸秒数与短毫秒', () => {
    expect(timecodeToMs('5')).toBe(5000);
    expect(timecodeToMs('00:00:00.5')).toBe(500);
    expect(timecodeToMs('00:00:00,05')).toBe(50);
  });

  it('拒绝非法输入', () => {
    expect(timecodeToMs('')).toBeNull();
    expect(timecodeToMs('abc')).toBeNull();
    expect(timecodeToMs('1:2:3:4')).toBeNull();
    expect(timecodeToMs('00:61:00')).toBeNull(); // 分钟超界
    expect(timecodeToMs('00:00:75')).toBeNull(); // 秒超界
  });
});

describe('formatDuration', () => {
  it('秒级与分级展示', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(125000)).toBe('2m 05s');
    expect(formatDuration(-1500)).toBe('-1.5s');
  });
});
