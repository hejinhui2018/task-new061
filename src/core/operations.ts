import type { Segment } from './types';

/** 按开始时间稳定排序（开始相同比结束，再相同比 id），不改动原数组 */
export function sortByStart(segments: Segment[]): Segment[] {
  return [...segments].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
  );
}

/**
 * 连锁平移：所有 start >= atMs 的片段整体移动 deltaMs（可为负）。
 * 用于“插入延迟”：在某个时间点之后腾出/收回空间，后续片段全部跟随。
 */
export function shiftSegmentsAfter(
  segments: Segment[],
  atMs: number,
  deltaMs: number,
): Segment[] {
  return segments.map((s) =>
    s.start >= atMs ? { ...s, start: s.start + deltaMs, end: s.end + deltaMs } : s,
  );
}

/** 批量平移：只移动指定 id 的片段，保持各自时长 */
export function shiftSegmentIds(
  segments: Segment[],
  ids: readonly string[],
  deltaMs: number,
): Segment[] {
  const idSet = new Set(ids);
  return segments.map((s) =>
    idSet.has(s.id) ? { ...s, start: s.start + deltaMs, end: s.end + deltaMs } : s,
  );
}

/** 拖动片段：移动到新起点，保持时长不变 */
export function moveSegmentTo(segments: Segment[], id: string, newStart: number): Segment[] {
  return segments.map((s) =>
    s.id === id ? { ...s, start: newStart, end: newStart + (s.end - s.start) } : s,
  );
}

/** 直接改写起止时间；end <= start 视为非法，原样返回 */
export function retimeSegment(
  segments: Segment[],
  id: string,
  start: number,
  end: number,
): Segment[] {
  if (end <= start) return segments;
  return segments.map((s) => (s.id === id ? { ...s, start, end } : s));
}

export function removeSegment(segments: Segment[], id: string): Segment[] {
  return segments.filter((s) => s.id !== id);
}

export function updateSegmentText(
  segments: Segment[],
  id: string,
  lang: string,
  text: string,
): Segment[] {
  return segments.map((s) =>
    s.id === id ? { ...s, texts: { ...s.texts, [lang]: text } } : s,
  );
}

export function updateSegmentSpeaker(
  segments: Segment[],
  id: string,
  speaker: string,
): Segment[] {
  return segments.map((s) => (s.id === id ? { ...s, speaker } : s));
}

/**
 * 按比例拆分文本：优先落在附近的空白边界上（避免把单词切开），
 * 无空白（如连续中文）则硬切。两端 trim。
 */
export function splitText(text: string, ratio: number): [string, string] {
  const clamped = Math.min(1, Math.max(0, ratio));
  const idx = Math.round(text.length * clamped);
  if (idx <= 0) return ['', text];
  if (idx >= text.length) return [text, ''];

  const isBoundary = (cut: number): boolean =>
    cut > 0 && cut < text.length && (/\s/.test(text[cut - 1]) || /\s/.test(text[cut]));

  const windowSize = Math.max(4, Math.ceil(text.length * 0.2));
  let cut = idx;
  for (let d = 0; d <= windowSize; d++) {
    if (isBoundary(idx - d)) {
      cut = idx - d;
      break;
    }
    if (isBoundary(idx + d)) {
      cut = idx + d;
      break;
    }
  }
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/**
 * 在 atMs 处拆分片段：前段 [start, atMs)，后段 [atMs, end)，
 * 说话人不变，各语言文本按时间比例拆分。atMs 不在片段内部时原样返回。
 * 新片段 id 自动去重（x → x-b → x-b2 …）。
 */
export function splitSegment(segments: Segment[], id: string, atMs: number): Segment[] {
  const target = segments.find((s) => s.id === id);
  if (!target) return segments;
  if (atMs <= target.start || atMs >= target.end) return segments;

  const taken = new Set(segments.map((s) => s.id));
  const secondId = uniqueId(`${id}-b`, taken);
  const ratio = (atMs - target.start) / (target.end - target.start);

  const first: Segment = { ...target, end: atMs, texts: {} };
  const second: Segment = { ...target, id: secondId, start: atMs, texts: {} };
  for (const lang of Object.keys(target.texts)) {
    const [a, b] = splitText(target.texts[lang], ratio);
    first.texts[lang] = a;
    second.texts[lang] = b;
  }
  return segments.flatMap((s) => (s.id === id ? [first, second] : [s]));
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export interface RepairResult {
  segments: Segment[];
  /** 被截短的片段：end 从 fromMs 收到 toMs */
  trimmed: { id: string; fromMs: number; toMs: number }[];
  /** 截短后时长不足 1ms 被移除的片段 id */
  removedIds: string[];
}

/**
 * 重叠修复：按开始时间扫描，前一片段的 end 若越过下一片段的 start，
 * 则把前一片段截到边界（相邻贴合不算重叠）；截短后不足 1ms 的片段移除。
 * 确定性算法，同样输入永远得到同样输出。
 */
export function repairOverlaps(segments: Segment[]): RepairResult {
  const sorted = sortByStart(segments);
  const kept: Segment[] = [];
  const trimmed: RepairResult['trimmed'] = [];
  const removedIds: string[] = [];

  for (const seg of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && prev.end > seg.start) {
      trimmed.push({ id: prev.id, fromMs: prev.end, toMs: seg.start });
      prev.end = seg.start;
      if (prev.end - prev.start < 1) {
        kept.pop();
        removedIds.push(prev.id);
      }
    }
    kept.push({ ...seg });
  }
  return { segments: kept, trimmed, removedIds };
}
