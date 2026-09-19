import type { Segment } from './types';
import { msToTimecode, timecodeToMs } from './timecode';
import { sortByStart } from './operations';

/**
 * 解析导入的 JSON 片段数组。每个元素：
 * { id?, start, end, speaker?, texts? } 或 { id?, start, end, speaker?, text? }
 * start/end 可以是毫秒数或时间码字符串。非法输入抛出带中文说明的 Error。
 */
export function parseImportedSegments(data: unknown, defaultLang = 'zh'): Segment[] {
  if (!Array.isArray(data)) throw new Error('导入内容必须是片段数组');
  const taken = new Set<string>();
  return data.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`第 ${i + 1} 个片段不是对象`);
    }
    const r = raw as Record<string, unknown>;
    const start = parseTimeValue(r.start);
    const end = parseTimeValue(r.end);
    if (start === null || end === null) {
      throw new Error(`第 ${i + 1} 个片段的时间码无效`);
    }
    if (end <= start) {
      throw new Error(`第 ${i + 1} 个片段的结束时间必须大于开始时间`);
    }
    const speaker =
      typeof r.speaker === 'string' && r.speaker.trim() ? r.speaker.trim() : '未知';

    let texts: Record<string, string> = {};
    if (typeof r.texts === 'object' && r.texts !== null) {
      for (const [lang, value] of Object.entries(r.texts as Record<string, unknown>)) {
        if (typeof value === 'string') texts[lang] = value;
      }
    } else if (typeof r.text === 'string') {
      texts = { [defaultLang]: r.text };
    }

    const baseId = typeof r.id === 'string' && r.id ? r.id : `imp-${i + 1}`;
    let id = baseId;
    let n = 2;
    while (taken.has(id)) id = `${baseId}-${n++}`;
    taken.add(id);

    return { id, start, end, speaker, texts };
  });
}

function parseTimeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') return timecodeToMs(value);
  return null;
}

/**
 * 解析 SRT 文本。首行文本若形如 “名字: 内容” 则提取说话人，
 * 否则说话人为「未知」。无法解析的块静默跳过。
 */
export function parseSrt(source: string, defaultLang = 'zh'): Segment[] {
  const blocks = source
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const segments: Segment[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeIdx].split('-->').map((x) => x.trim());
    const start = timecodeToMs(startRaw ?? '');
    const end = timecodeToMs(endRaw ?? '');
    if (start === null || end === null || end <= start) continue;

    const textLines = lines.slice(timeIdx + 1);
    let speaker = '未知';
    const speakerMatch = /^([^\s:：]{1,20})\s*[:：]\s*(.*)$/.exec(textLines[0] ?? '');
    if (speakerMatch) {
      speaker = speakerMatch[1];
      textLines[0] = speakerMatch[2];
    }
    const text = textLines.join('\n').trim();
    segments.push({
      id: `srt-${segments.length + 1}`,
      start,
      end,
      speaker,
      texts: { [defaultLang]: text },
    });
  }
  return segments;
}

/** 导出指定语言为 SRT（说话人以前缀形式写回文本） */
export function toSrt(segments: Segment[], lang: string): string {
  return sortByStart(segments)
    .map((s, i) => {
      const text = (s.texts[lang] ?? '').replace(/\n/g, ' ').trim();
      return `${i + 1}\n${msToTimecode(s.start)} --> ${msToTimecode(s.end)}\n${s.speaker}: ${text}\n`;
    })
    .join('\n');
}
