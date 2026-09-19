import type { Segment } from './types';
import type { Clock } from './clock';

/** 版本快照：某一时刻的完整片段集合，createdAt 来自注入时钟 */
export interface Version {
  id: string;
  label: string;
  createdAt: number;
  segments: Segment[];
}

export function createVersion(
  segments: Segment[],
  label: string,
  clock: Clock,
  id: string,
): Version {
  return {
    id,
    label,
    createdAt: clock(),
    // 深拷贝，之后对文档的修改不影响快照
    segments: segments.map((s) => ({ ...s, texts: { ...s.texts } })),
  };
}

export interface TextChange {
  lang: string;
  before: string;
  after: string;
}

export interface SegmentChange {
  id: string;
  speaker: string;
  kind: 'added' | 'removed' | 'changed';
  before?: Segment;
  after?: Segment;
  /** 相对旧版本的起点位移（毫秒），仅 changed 时有值 */
  timeShiftMs?: number;
  durationChangeMs?: number;
  speakerChanged?: boolean;
  textChanges?: TextChange[];
}

/** 对比两个版本（a → b）：新增、删除、修改（平移/时长/说话人/文本） */
export function diffVersions(a: Version, b: Version): SegmentChange[] {
  const aById = new Map(a.segments.map((s) => [s.id, s]));
  const bById = new Map(b.segments.map((s) => [s.id, s]));
  const changes: SegmentChange[] = [];

  for (const s of b.segments) {
    if (!aById.has(s.id)) {
      changes.push({ id: s.id, speaker: s.speaker, kind: 'added', after: s });
    }
  }
  for (const s of a.segments) {
    if (!bById.has(s.id)) {
      changes.push({ id: s.id, speaker: s.speaker, kind: 'removed', before: s });
    }
  }
  for (const s of b.segments) {
    const prev = aById.get(s.id);
    if (!prev) continue;
    const timeShiftMs = s.start - prev.start;
    const durationChangeMs = s.end - s.start - (prev.end - prev.start);
    const speakerChanged = prev.speaker !== s.speaker;
    const langs = new Set([...Object.keys(prev.texts), ...Object.keys(s.texts)]);
    const textChanges: TextChange[] = [...langs]
      .filter((lang) => (prev.texts[lang] ?? '') !== (s.texts[lang] ?? ''))
      .map((lang) => ({ lang, before: prev.texts[lang] ?? '', after: s.texts[lang] ?? '' }));
    if (timeShiftMs !== 0 || durationChangeMs !== 0 || speakerChanged || textChanges.length > 0) {
      changes.push({
        id: s.id,
        speaker: s.speaker,
        kind: 'changed',
        before: prev,
        after: s,
        timeShiftMs,
        durationChangeMs,
        speakerChanged,
        textChanges,
      });
    }
  }

  const startOf = (c: SegmentChange): number => c.before?.start ?? c.after?.start ?? 0;
  return changes.sort((x, y) => startOf(x) - startOf(y) || x.id.localeCompare(y.id));
}
