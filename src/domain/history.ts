import type { Transcript } from './types';

/**
 * 撤销/重做 + 版本历史。
 * 时钟可注入（默认 Date.now），因此版本时间戳在测试中完全可控；
 * 历史本身是纯数据，可用 JSON 序列化后写入 localStorage，刷新页面再恢复。
 */

export interface TranscriptVersion {
  versionId: string;
  createdAt: number;
  label: string;
  transcript: Transcript;
}

export interface HistoryState {
  seq: number;
  past: TranscriptVersion[];
  present: TranscriptVersion;
  future: TranscriptVersion[];
}

export type Clock = () => number;

export interface CreateHistoryOptions {
  clock?: Clock;
  /** 历史上限，默认 100 */
  maxEntries?: number;
  label?: string;
  now?: number;
}

function deepClone(t: Transcript): Transcript {
  return JSON.parse(JSON.stringify(t)) as Transcript;
}

export function createHistory(
  initial: Transcript,
  options: CreateHistoryOptions = {},
): HistoryState {
  const now = options.now ?? (options.clock ? options.clock() : Date.now());
  return {
    seq: 1,
    past: [],
    future: [],
    present: { versionId: 'v1', createdAt: now, label: options.label ?? '初始版本', transcript: deepClone(initial) },
  };
}

/**
 * 提交一个新版本。transcript 会被深拷贝，调用方之后继续修改草稿不会污染历史。
 * 提交新编辑会清空 redo 分支（与常见编辑器语义一致）。
 */
export function commit(
  history: HistoryState,
  transcript: Transcript,
  label: string,
  clock: Clock = Date.now,
  maxEntries = 100,
): HistoryState {
  const seq = history.seq + 1;
  const version: TranscriptVersion = {
    versionId: `v${seq}`,
    createdAt: clock(),
    label,
    transcript: deepClone(transcript),
  };
  const past = [...history.past, history.present];
  // maxEntries 为保留版本总数（含当前版本），故过去最多保留 maxEntries - 1 条
  while (past.length >= maxEntries) past.shift();
  return { seq, past, present: version, future: [] };
}

export function undo(history: HistoryState): HistoryState {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    seq: history.seq,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: HistoryState): HistoryState {
  const next = history.future[0];
  if (!next) return history;
  return {
    seq: history.seq,
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo(h: HistoryState): boolean {
  return h.past.length > 0;
}

export function canRedo(h: HistoryState): boolean {
  return h.future.length > 0;
}

/** 全部版本（过去 + 当前），供版本对比面板选择 */
export function listVersions(h: HistoryState): TranscriptVersion[] {
  return [...h.past, h.present];
}

export function findVersion(h: HistoryState, versionId: string): TranscriptVersion | undefined {
  return listVersions(h).find((v) => v.versionId === versionId);
}

/**
 * 恢复旧版本：把旧版本内容作为一个*新*版本提交（线性历史、可审计），
 * 标签标注来源版本，仍然支持再次撤销。
 */
export function restoreVersion(
  h: HistoryState,
  versionId: string,
  clock: Clock = Date.now,
  maxEntries = 100,
): HistoryState {
  const target = findVersion(h, versionId);
  if (!target) throw new Error(`找不到版本 ${versionId}`);
  if (target.versionId === h.present.versionId) return h;
  return commit(h, target.transcript, `恢复自 ${target.versionId}（${target.label}）`, clock, maxEntries);
}

/* ---------- 版本对比 ---------- */

export interface TimeChange {
  before: { start: number; end: number };
  after: { start: number; end: number };
}

export interface TextChange {
  language: string;
  before: string;
  after: string;
}

export interface CueChange {
  id: string;
  kind: 'added' | 'removed' | 'modified';
  time?: TimeChange;
  speaker?: { before: string; after: string };
  texts: TextChange[];
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;
  changes: CueChange[];
  added: number;
  removed: number;
  modified: number;
}

/** 纯函数对比两个版本，按片段 ID 给出时间码/发言人/文本差异 */
export function diffVersions(
  from: TranscriptVersion,
  to: TranscriptVersion,
): VersionDiff {
  const before = new Map(from.transcript.cues.map((c) => [c.id, c]));
  const after = new Map(to.transcript.cues.map((c) => [c.id, c]));
  const changes: CueChange[] = [];

  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a) {
      changes.push({ id, kind: 'removed', texts: [] });
      continue;
    }
    const change: CueChange = { id, kind: 'modified', texts: [] };
    let changed = false;
    if (a.start !== b.start || a.end !== b.end) {
      change.time = {
        before: { start: b.start, end: b.end },
        after: { start: a.start, end: a.end },
      };
      changed = true;
    }
    if (a.speakerId !== b.speakerId) {
      change.speaker = { before: b.speakerId, after: a.speakerId };
      changed = true;
    }
    const langs = new Set([...Object.keys(b.text), ...Object.keys(a.text)]);
    for (const lang of langs) {
      if ((b.text[lang] ?? '') !== (a.text[lang] ?? '')) {
        change.texts.push({ language: lang, before: b.text[lang] ?? '', after: a.text[lang] ?? '' });
        changed = true;
      }
    }
    if (changed) changes.push(change);
  }
  for (const id of after.keys()) {
    if (!before.has(id)) changes.push({ id, kind: 'added', texts: [] });
  }

  const ordered = [...changes].sort((a, b) => {
    const ta = after.get(a.id)?.start ?? before.get(a.id)?.start ?? 0;
    const tb = after.get(b.id)?.start ?? before.get(b.id)?.start ?? 0;
    return ta - tb;
  });

  return {
    fromVersionId: from.versionId,
    toVersionId: to.versionId,
    changes: ordered,
    added: ordered.filter((c) => c.kind === 'added').length,
    removed: ordered.filter((c) => c.kind === 'removed').length,
    modified: ordered.filter((c) => c.kind === 'modified').length,
  };
}

/* ---------- 序列化 / 刷新恢复 ---------- */

export interface PersistedState {
  version: 1;
  savedAt: number;
  history: HistoryState;
}

export function serializeHistory(h: HistoryState, clock: Clock = Date.now): string {
  const payload: PersistedState = { version: 1, savedAt: clock(), history: h };
  return JSON.stringify(payload);
}

/** 解析并校验持久化数据；损坏或形状不符时返回 null，由调用方回退到示例数据 */
export function restoreHistory(raw: string): HistoryState | null {
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1 || !parsed.history?.present?.transcript) return null;
    const h = parsed.history;
    if (!Array.isArray(h.past) || !Array.isArray(h.future) || typeof h.seq !== 'number') return null;
    if (!Array.isArray(h.present.transcript.cues) || !Array.isArray(h.present.transcript.speakers)) return null;
    return h;
  } catch {
    return null;
  }
}
