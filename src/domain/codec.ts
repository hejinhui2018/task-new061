import type { Cue, LanguageCode, Speaker, Transcript } from './types';
import { LANGUAGES, SOURCE_LANG } from './types';
import { parseTimecode, formatTimecode } from './time';
import { ensureSpeakers } from './ops';

/**
 * 导入/导出。导入做严格校验，任何结构性错误都抛出带中文提示的异常，
 * 由 UI 展示而不是静默吞掉。
 */

export interface ImportPayload {
  speakers?: Speaker[];
  cues?: Array<Partial<Cue> & { start?: number | string; end?: number | string }>;
}

export function importTranscript(data: unknown): Transcript {
  if (typeof data !== 'object' || data === null) {
    throw new Error('文件内容不是有效的 JSON 对象');
  }
  const payload = data as ImportPayload;
  if (!Array.isArray(payload.cues) || payload.cues.length === 0) {
    throw new Error('缺少 cues 数组或数组为空');
  }

  const rawSpeakers = Array.isArray(payload.speakers) ? payload.speakers : [];
  const speakers = ensureSpeakers(
    rawSpeakers.map((s, i) => ({
      id: String(s?.id ?? `speaker${i + 1}`),
      name: String(s?.name ?? s?.id ?? `发言人 ${i + 1}`),
      color: typeof s?.color === 'string' ? s.color : '',
    })),
  );
  const speakerIds = new Set(speakers.map((s) => s.id));
  if (speakers.length === 0) {
    speakers.push({ id: 'speaker1', name: '发言人 1', color: '#4f8cff' });
    speakerIds.add('speaker1');
  }

  const cues: Cue[] = payload.cues.map((raw, i) => {
    const start = toMs(raw?.start, `第 ${i + 1} 条的 start`);
    const end = toMs(raw?.end, `第 ${i + 1} 条的 end`);
    if (end <= start) {
      throw new Error(`第 ${i + 1} 条时长无效：end(${end}) 必须晚于 start(${start})`);
    }
    const speakerId = String(raw?.speakerId ?? speakers[0]?.id ?? 'speaker1');
    if (!speakerIds.has(speakerId) && rawSpeakers.length > 0) {
      throw new Error(`第 ${i + 1} 条引用了不存在的发言人 ${speakerId}`);
    }
    const text = normalizeText(raw?.text, i);
    return {
      id: String(raw?.id ?? `cue${i + 1}`),
      start,
      end,
      speakerId: speakerIds.has(speakerId) ? speakerId : speakers[0].id,
      text,
    };
  });

  // ID 唯一性
  const ids = new Set<string>();
  for (const cue of cues) {
    if (ids.has(cue.id)) throw new Error(`片段 ID 重复: ${cue.id}`);
    ids.add(cue.id);
  }

  // 未在 speakers 中声明但被引用的发言人，自动补一个条目，避免标签丢失
  for (const cue of cues) {
    if (!speakerIds.has(cue.speakerId)) {
      speakers.push({ id: cue.speakerId, name: cue.speakerId, color: '#9b6ef3' });
      speakerIds.add(cue.speakerId);
    }
  }

  return { speakers, cues: [...cues].sort((a, b) => a.start - b.start) };
}

function toMs(value: number | string | undefined, field: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} 缺失`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field} 必须是非负数值`);
    return Math.round(value);
  }
  return parseTimecode(String(value));
}

function normalizeText(raw: unknown, index: number): Record<string, string> {
  if (typeof raw === 'string') return { [SOURCE_LANG]: raw };
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`第 ${index + 1} 条缺少 text 字段`);
  }
  const entries = Object.entries(raw as Record<string, unknown>).filter(([, v]) => v != null);
  if (entries.length === 0) throw new Error(`第 ${index + 1} 条 text 为空`);
  const text: Record<string, string> = {};
  for (const [lang, value] of entries) {
    text[lang] = String(value);
  }
  if (!text[SOURCE_LANG]) {
    // 第一个语言作为源语言兜底
    text[SOURCE_LANG] = entries[0][1] as string;
  }
  return text;
}

/** 项目 JSON（含全部语言与发言人） */
export function exportProjectJson(transcript: Transcript): string {
  return JSON.stringify(transcript, null, 2);
}

/** 导出指定语言的 SRT */
export function exportSrt(transcript: Transcript, language: LanguageCode = SOURCE_LANG): string {
  const ordered = [...transcript.cues].sort((a, b) => a.start - b.start);
  return ordered
    .map((cue, i) => {
      const speaker = transcript.speakers.find((s) => s.id === cue.speakerId);
      const prefix = speaker ? `${speaker.name}: ` : '';
      const body = cue.text[language] ?? cue.text[SOURCE_LANG] ?? '';
      return `${i + 1}\n${formatTimecode(cue.start)} --> ${formatTimecode(cue.end)}\n${prefix}${body}`;
    })
    .join('\n\n')
    .concat('\n');
}

/** 极简 SRT 解析（时间码 + 文本），发言人从 "Name: " 前缀识别 */
export function parseSrt(content: string): Transcript {
  const blocks = content.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const cues: Cue[] = [];
  const speakerNames = new Map<string, string>();
  blocks.forEach((block, i) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const tcLine = lines.find((l) => l.includes('-->'));
    if (!tcLine) throw new Error(`第 ${i + 1} 块缺少时间码行`);
    const [startTc, endTc] = tcLine.split('-->').map((s) => s.trim());
    const bodyStart = lines.indexOf(tcLine) + 1;
    let body = lines.slice(bodyStart).join('\n');
    let speakerId = 'speaker1';
    const match = /^([^:：]{1,30})[:：]\s*/.exec(body);
    if (match) {
      speakerId = `spk-${match[1].trim().replace(/\s+/g, '-').toLowerCase()}`;
      speakerNames.set(speakerId, match[1].trim());
      body = body.slice(match[0].length);
    }
    cues.push({
      id: `cue${i + 1}`,
      start: parseTimecode(startTc),
      end: parseTimecode(endTc),
      speakerId,
      text: { [SOURCE_LANG]: body },
    });
  });
  const speakers = ensureSpeakers(
    [...speakerNames.entries()].map(([id, name]) => ({ id, name, color: '' })),
  );
  for (const cue of cues) {
    if (!speakers.some((s) => s.id === cue.speakerId)) {
      speakers.push({ id: cue.speakerId, name: cue.speakerId, color: '#9b6ef3' });
    }
  }
  return { speakers, cues };
}

export const IMPORT_LANGUAGE_NOTE: LanguageCode[] = [...LANGUAGES];
