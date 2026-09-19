import type { CaptionDoc } from './types';
import type { Version } from './versions';
import type { Clock } from './clock';

/** 与 localStorage 同形的最小接口，测试里用内存实现替换 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedSession {
  version: 1;
  savedAt: number;
  doc: CaptionDoc;
  versions: Version[];
}

/** 保存会话（文档 + 版本快照）；存储失败不抛出，避免打断编辑 */
export function saveSession(
  storage: StorageLike,
  key: string,
  doc: CaptionDoc,
  versions: Version[],
  clock: Clock,
): void {
  const payload: PersistedSession = { version: 1, savedAt: clock(), doc, versions };
  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // 配额超限等情况静默忽略
  }
}

/** 读取会话；数据缺失、损坏或版本不符时返回 null（回退到内置示例） */
export function loadSession(storage: StorageLike, key: string): PersistedSession | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<PersistedSession>;
    if (
      p.version !== 1 ||
      typeof p.savedAt !== 'number' ||
      !p.doc ||
      !Array.isArray(p.doc.segments) ||
      !Array.isArray(p.versions)
    ) {
      return null;
    }
    return p as PersistedSession;
  } catch {
    return null;
  }
}
