import { describe, expect, it } from 'vitest';
import type { Clock } from './clock';
import { DEFAULT_ISSUE_OPTIONS } from './types';
import { detectIssues } from './issues';
import { shiftSegmentsAfter } from './operations';
import { buildSampleDoc } from './sample';
import { createVersion } from './versions';
import { loadSession, saveSession, type StorageLike } from './storage';

const KEY = 'captionflow.test.session';

/** 内存版 localStorage，模拟“刷新后重新打开” */
class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const fixedClock: Clock = () => 1_700_000_000_000;

describe('会话持久化与版本恢复', () => {
  it('保存 → 模拟刷新 → 恢复：文档与版本完整还原', () => {
    const storage = new MemoryStorage();
    const doc = buildSampleDoc();

    // 编辑：30 秒处插入 2 秒延迟，然后保存“调整前基线”版本
    const edited = { ...doc, segments: shiftSegmentsAfter(doc.segments, 30000, 2000) };
    const versions = [createVersion(doc.segments, '调整前基线', fixedClock, 'v-1')];
    saveSession(storage, KEY, edited, versions, fixedClock);

    // 模拟刷新：全新会话从存储加载
    const restored = loadSession(storage, KEY);
    expect(restored).not.toBeNull();
    expect(restored!.savedAt).toBe(1_700_000_000_000);
    expect(restored!.doc.segments).toEqual(edited.segments);
    expect(restored!.versions).toHaveLength(1);

    // 从恢复的版本快照回滚，内容与基线完全一致（含问题检测结果）
    const baseline = restored!.versions[0];
    expect(baseline.label).toBe('调整前基线');
    expect(baseline.segments).toEqual(doc.segments);
    expect(detectIssues(baseline.segments, DEFAULT_ISSUE_OPTIONS)).toEqual(
      detectIssues(doc.segments, DEFAULT_ISSUE_OPTIONS),
    );
  });

  it('savedAt 来自注入时钟，便于断言“保存于某时刻”', () => {
    const storage = new MemoryStorage();
    saveSession(storage, KEY, buildSampleDoc(), [], fixedClock);
    expect(loadSession(storage, KEY)?.savedAt).toBe(1_700_000_000_000);
  });

  it('损坏或不兼容的数据返回 null（回退到内置示例）', () => {
    const storage = new MemoryStorage();
    expect(loadSession(storage, KEY)).toBeNull(); // 从未保存

    storage.setItem(KEY, '{broken json');
    expect(loadSession(storage, KEY)).toBeNull();

    storage.setItem(KEY, JSON.stringify({ version: 99, doc: {} }));
    expect(loadSession(storage, KEY)).toBeNull();

    storage.setItem(KEY, JSON.stringify({ version: 1, savedAt: 1, doc: { segments: 'nope' }, versions: [] }));
    expect(loadSession(storage, KEY)).toBeNull();
  });

  it('内置示例数据本身合法：无重叠、无空白、无说话人冲突', () => {
    const issues = detectIssues(buildSampleDoc().segments, DEFAULT_ISSUE_OPTIONS);
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(0);
    expect(issues.filter((i) => i.kind === 'gap')).toHaveLength(0);
    expect(issues.filter((i) => i.kind === 'speaker-conflict')).toHaveLength(0);
    // seg-04 的英文译文故意超长 → 演示翻译超时
    const timeouts = issues.filter((i) => i.kind === 'translation-timeout');
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].segmentIds).toEqual(['seg-04']);
  });
});
