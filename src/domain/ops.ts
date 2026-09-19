import type { Cue, LanguageCode, Speaker } from './types';
import { clamp, overlapAmount, snap as snapValue } from './time';

/** 拆分后允许的最短片段时长 */
export const MIN_DURATION = 250;

export interface CueBounds {
  start: number;
  end: number;
}

export interface ImpactedCue {
  id: string;
  /** 调整前；新增片段为 null */
  before: CueBounds | null;
  /** 调整后；删除片段为 null */
  after: CueBounds | null;
  added?: boolean;
}

export interface OperationResult {
  cues: Cue[];
  impacted: ImpactedCue[];
  summary: string;
}

export interface MoveOptions {
  /** 吸附步长（毫秒），0 表示不取整 */
  snapStep?: number;
  /** 仅允许在两条相邻片段之间移动（不制造重叠） */
  constrain?: boolean;
}

type MutableCue = Cue;

function clone(cues: Cue[]): MutableCue[] {
  return cues.map((c) => ({ ...c, text: { ...c.text } }));
}

function sortByStart(cues: Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
}

function diff(prev: Cue[], next: Cue[]): ImpactedCue[] {
  const before = new Map(prev.map((c) => [c.id, c]));
  const after = new Map(next.map((c) => [c.id, c]));
  const impacted: ImpactedCue[] = [];
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a) {
      impacted.push({ id, before: { start: b.start, end: b.end }, after: null });
    } else if (a.start !== b.start || a.end !== b.end) {
      impacted.push({ id, before: { start: b.start, end: b.end }, after: { start: a.start, end: a.end } });
    }
  }
  for (const [id, a] of after) {
    if (!before.has(id)) {
      impacted.push({ id, before: null, after: { start: a.start, end: a.end }, added: true });
    }
  }
  return impacted.sort((x, y) => (x.after?.start ?? x.before?.start ?? 0) - (y.after?.start ?? y.before?.start ?? 0));
}

/** 拖动整条片段：保持时长，可吸附；constrain 时限制在前后邻居之间 */
export function moveCue(cues: Cue[], id: string, rawStart: number, options: MoveOptions = {}): OperationResult {
  const step = options.snapStep ?? 10;
  const target = step > 0 ? snapValue(rawStart, step) : Math.round(rawStart);
  const next = clone(cues);
  const cue = next.find((c) => c.id === id);
  if (!cue) throw new Error(`找不到片段 ${id}`);
  const duration = cue.end - cue.start;

  let minStart = 0;
  let maxStart = Number.POSITIVE_INFINITY;
  if (options.constrain) {
    const ordered = sortByStart(cues);
    const idx = ordered.findIndex((c) => c.id === id);
    if (idx > 0) minStart = ordered[idx - 1].end;
    if (idx >= 0 && idx < ordered.length - 1) maxStart = ordered[idx + 1].start - duration;
  }
  const start = clamp(target, minStart, Math.max(minStart, maxStart));
  cue.start = start;
  cue.end = start + duration;
  return { cues: next, impacted: diff(cues, next), summary: `移动片段 ${id}` };
}

export type Edge = 'start' | 'end';

/** 拖动边缘调整时长，自动吸附并保证最短时长、不越过另一边缘 */
export function trimCue(cues: Cue[], id: string, edge: Edge, rawValue: number, snapStep = 10): OperationResult {
  const value = snapStep > 0 ? snapValue(rawValue, snapStep) : Math.round(rawValue);
  const next = clone(cues);
  const cue = next.find((c) => c.id === id);
  if (!cue) throw new Error(`找不到片段 ${id}`);
  if (edge === 'start') {
    cue.start = clamp(value, 0, cue.end - MIN_DURATION);
  } else {
    cue.end = Math.max(cue.start + MIN_DURATION, value);
  }
  return { cues: next, impacted: diff(cues, next), summary: `调整片段 ${id} 的${edge === 'start' ? '入点' : '出点'}` };
}

/** 可注入的 ID 生成器，测试中可替换为计数桩 */
export type IdFactory = () => string;
export const createIdFactory = (prefix: string): IdFactory => {
  let counter = 0;
  return () => `${prefix}${(++counter).toString(36)}${Date.now().toString(36).slice(-4)}`;
};

/**
 * 在指定时刻拆分片段：前半保留原文，后半继承发言人并按空格/字符切分文本。
 * 拆出的新片段紧随其后、互不重叠（相邻边界）。
 */
export function splitCue(cues: Cue[], id: string, atMs: number, idFactory: IdFactory): OperationResult {
  const next = clone(cues);
  const cue = next.find((c) => c.id === id);
  if (!cue) throw new Error(`找不到片段 ${id}`);
  const at = clamp(Math.round(atMs), cue.start + MIN_DURATION, cue.end - MIN_DURATION);
  const newId = idFactory();
  const text = splitText(cue.text, at - cue.start, cue.end - cue.start);
  cue.text = text.before;

  const second: Cue = {
    id: newId,
    start: at,
    end: cue.end,
    speakerId: cue.speakerId,
    text: text.after,
  };
  cue.end = at;
  next.push(second);
  const finalCues = sortByStart(next);
  return {
    cues: finalCues,
    impacted: [
      ...diff(cues, finalCues),
    ],
    summary: `在 ${at}ms 拆分片段 ${id}`,
  };
}

function splitText(
  texts: Record<string, string>,
  beforeDuration: number,
  totalDuration: number,
): { before: Record<string, string>; after: Record<string, string> } {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const [lang, value] of Object.entries(texts)) {
    const ratio = beforeDuration / totalDuration;
    const [head, tail] = splitByLanguage(value, ratio, lang as LanguageCode);
    before[lang] = head;
    after[lang] = tail;
  }
  return { before, after };
}

function splitByLanguage(text: string, ratio: number, lang: LanguageCode): [string, string] {
  const cut = Math.max(1, Math.round(text.length * ratio));
  if (lang === 'zh') {
    // 中文无空格，直接按字符切
    return [text.slice(0, cut), text.slice(cut)];
  }
  const words = text.split(/(\s+)/); // 保留空白，拼回时不丢格式
  let acc = '';
  for (let i = 0; i < words.length; i += 2) {
    const candidate = acc + words[i];
    if (candidate.length >= cut && acc.length > 0) {
      return [acc.trim(), words.slice(i).join('').trim()];
    }
    acc = candidate + (words[i + 1] ?? '');
  }
  return [text.trim(), ''];
}

/**
 * 插入延迟：从 atMs 起，所有 start >= atMs 的片段整体后移 durationMs。
 * 这正是“插入一句话”的受控连锁平移，已开始的片段不受影响。
 */
export function insertDelay(cues: Cue[], atMs: number, durationMs: number): OperationResult {
  if (durationMs < 0) throw new Error('插入延迟不能为负，请使用批量平移负向回收');
  const at = Math.max(0, Math.round(atMs));
  const next = clone(cues).map((c) =>
    c.start >= at ? { ...c, start: c.start + durationMs, end: c.end + durationMs } : c,
  );
  return {
    cues: sortByStart(next),
    impacted: diff(cues, next),
    summary: `在 ${at}ms 处插入 ${durationMs}ms 延迟，连锁平移 ${next.filter((c) => c.start >= at).length} 条`,
  };
}

/**
 * 批量平移：把指定片段（默认某条及之后的全部）整体平移 deltaMs。
 * 平移会整体被钳制，保证没有任何片段早于 0ms。
 */
export function batchShift(
  cues: Cue[],
  options: { fromId?: string; ids?: string[]; deltaMs: number },
): OperationResult {
  const { deltaMs } = options;
  const selected = selectIds(cues, options.fromId, options.ids);
  const earliest = cues.filter((c) => selected.has(c.id)).reduce((m, c) => Math.min(m, c.start), Number.POSITIVE_INFINITY);
  const shift = Number.isFinite(earliest) ? Math.max(deltaMs, -earliest) : deltaMs;
  const next = clone(cues).map((c) =>
    selected.has(c.id) ? { ...c, start: c.start + shift, end: c.end + shift } : c,
  );
  return {
    cues: sortByStart(next),
    impacted: diff(cues, next),
    summary: `批量平移 ${selected.size} 条片段 ${shift >= 0 ? '+' : ''}${shift}ms`,
  };
}

function selectIds(cues: Cue[], fromId?: string, ids?: string[]): Set<string> {
  if (ids) return new Set(ids);
  if (fromId) {
    const threshold = cues.find((c) => c.id === fromId)?.start;
    if (threshold === undefined) throw new Error(`找不到片段 ${fromId}`);
    return new Set(cues.filter((c) => c.start >= threshold).map((c) => c.id));
  }
  return new Set(cues.map((c) => c.id));
}

/** 更换发言人标签（不产生时间影响，历史里仍可追踪） */
export function changeSpeaker(cues: Cue[], id: string, speakerId: string): { cues: Cue[]; speakerId: string } {
  const next = clone(cues);
  const cue = next.find((c) => c.id === id);
  if (!cue) throw new Error(`找不到片段 ${id}`);
  cue.speakerId = speakerId;
  return { cues: next, speakerId };
}

export type OverlapRepairMode = 'trim' | 'ripple';

/**
 * 修复重叠。
 * - trim（默认）：后一条的入点裁到前一条的出点；短于最短时长则延长出点，可能继续向后连锁。
 * - ripple：后一条保持时长整体右移，天然产生连锁平移直到不再重叠。
 * 传入 cueId 时只修复与该片段相关的重叠；省略则修复全时间轴。
 */
export function repairOverlap(
  cues: Cue[],
  cueId?: string,
  mode: OverlapRepairMode = 'trim',
): OperationResult {
  let next = clone(cues);
  const guard = next.length * next.length + 4;
  let iterations = 0;
  while (iterations++ < guard) {
    const ordered = sortByStart(next);
    const pair = findOverlappingPair(ordered, cueId);
    if (!pair) break;
    const [earlier, later] = pair;
    const duration = later.end - later.start;
    later.start = earlier.end;
    later.end = mode === 'ripple' ? later.start + duration : Math.max(earlier.end + MIN_DURATION, later.end);
    next = ordered;
  }
  return {
    cues: sortByStart(next),
    impacted: diff(cues, next),
    summary: `${mode === 'ripple' ? '连锁平移' : '裁切'}方式修复重叠`,
  };
}

function findOverlappingPair(ordered: Cue[], anchorId?: string): [Cue, Cue] | null {
  for (let i = 0; i < ordered.length - 1; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      if (b.start >= a.end) break;
      if (overlapAmount(a.start, a.end, b.start, b.end) > 0) {
        if (!anchorId || a.id === anchorId || b.id === anchorId) return [a, b];
      }
    }
  }
  return null;
}

/** 发言人映射工具：为导入数据补齐颜色 */
export function ensureSpeakers(speakers: Speaker[]): Speaker[] {
  const palette = ['#4f8cff', '#e8635a', '#3aa76d', '#f0a430', '#9b6ef3'];
  return speakers.map((s, i) => ({
    id: s.id,
    name: s.name || s.id,
    color: s.color || palette[i % palette.length],
  }));
}
