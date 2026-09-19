import { describe, expect, it } from 'vitest';
import type { Segment } from './types';
import type { Clock } from './clock';
import { createVersion, diffVersions } from './versions';

const seg = (id: string, start: number, end: number, speaker = 'A', zh = ''): Segment => ({
  id,
  start,
  end,
  speaker,
  texts: { zh },
});

const fixedClock: Clock = () => 1_700_000_000_000;

describe('createVersion · 注入时钟', () => {
  it('createdAt 来自注入的时钟而非真实时间', () => {
    const v = createVersion([seg('a', 0, 1000)], '基线', fixedClock, 'v-1');
    expect(v.createdAt).toBe(1_700_000_000_000);
    expect(v.label).toBe('基线');
    expect(v.id).toBe('v-1');
  });

  it('快照是深拷贝：之后修改文档不影响快照', () => {
    const segments = [seg('a', 0, 1000, 'A', '你好')];
    const v = createVersion(segments, '基线', fixedClock, 'v-1');
    segments[0].texts.zh = '被改了';
    segments[0].start = 999;
    expect(v.segments[0].texts.zh).toBe('你好');
    expect(v.segments[0].start).toBe(0);
  });
});

describe('diffVersions · 版本对比', () => {
  it('识别平移、新增、删除', () => {
    const v1 = createVersion([seg('a', 0, 1000), seg('b', 2000, 3000)], 'v1', fixedClock, 'v1');
    const v2 = createVersion(
      [seg('a', 500, 1500), seg('c', 4000, 5000)], // a 平移 +500，b 删除，c 新增
      'v2',
      fixedClock,
      'v2',
    );
    const diff = diffVersions(v1, v2);
    const changeA = diff.find((d) => d.id === 'a');
    expect(changeA?.kind).toBe('changed');
    expect(changeA?.timeShiftMs).toBe(500);
    expect(diff.find((d) => d.id === 'b')?.kind).toBe('removed');
    expect(diff.find((d) => d.id === 'c')?.kind).toBe('added');
  });

  it('识别文本与说话人修改', () => {
    const v1 = createVersion([seg('a', 0, 1000, '甲', '原文')], 'v1', fixedClock, 'v1');
    const v2 = createVersion([seg('a', 0, 1000, '乙', '改后')], 'v2', fixedClock, 'v2');
    const diff = diffVersions(v1, v2);
    expect(diff).toHaveLength(1);
    expect(diff[0].speakerChanged).toBe(true);
    expect(diff[0].textChanges).toEqual([{ lang: 'zh', before: '原文', after: '改后' }]);
  });

  it('完全一致的版本没有差异', () => {
    const v1 = createVersion([seg('a', 0, 1000, '甲', '你好')], 'v1', fixedClock, 'v1');
    const v2 = createVersion([seg('a', 0, 1000, '甲', '你好')], 'v2', fixedClock, 'v2');
    expect(diffVersions(v1, v2)).toHaveLength(0);
  });

  it('差异按时间位置排序', () => {
    const v1 = createVersion([], 'v1', fixedClock, 'v1');
    const v2 = createVersion(
      [seg('late', 9000, 10000), seg('early', 100, 500)],
      'v2',
      fixedClock,
      'v2',
    );
    const diff = diffVersions(v1, v2);
    expect(diff.map((d) => d.id)).toEqual(['early', 'late']);
  });
});
