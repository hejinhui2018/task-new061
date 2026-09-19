import type { Issue, IssueOptions, Segment } from './types';
import { sortByStart } from './operations';

const nonSpaceLength = (text: string): number => text.replace(/\s+/g, '').length;

/**
 * 全量问题检测（纯函数）：
 * - overlap：不同说话人的片段时间相交
 * - speaker-conflict：同一说话人的片段时间相交（更严重，单独归类）
 * - gap：相邻片段间隔超过 gapThresholdMs
 * - translation-timeout：某语言译文的阅读速度（非空白字符/秒）超过 maxCps
 *
 * 相邻边界（end === start）不算重叠也不算空白。
 */
export function detectIssues(segments: Segment[], options: IssueOptions): Issue[] {
  const issues: Issue[] = [];
  const sorted = sortByStart(segments);

  // 重叠 / 说话人冲突：按 start 排序后两两扫描，b.start >= a.end 即可提前结束内层
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.start >= a.end) break;
      const overlapMs = a.end - b.start;
      if (a.speaker === b.speaker) {
        issues.push({
          id: `speaker-conflict:${a.id}:${b.id}`,
          kind: 'speaker-conflict',
          segmentIds: [a.id, b.id],
          at: b.start,
          message: `同一说话人「${a.speaker}」的两个片段重叠 ${overlapMs}ms`,
        });
      } else {
        issues.push({
          id: `overlap:${a.id}:${b.id}`,
          kind: 'overlap',
          segmentIds: [a.id, b.id],
          at: b.start,
          message: `「${a.speaker}」与「${b.speaker}」的片段重叠 ${overlapMs}ms`,
        });
      }
    }
  }

  // 空白：用“目前最晚的 end”与下一段比较，重叠片段不会造成假空白
  let last: Segment | null = null;
  for (const s of sorted) {
    if (last && s.start - last.end > options.gapThresholdMs) {
      issues.push({
        id: `gap:${last.id}:${s.id}`,
        kind: 'gap',
        segmentIds: [last.id, s.id],
        at: last.end,
        message: `「${last.speaker}」与「${s.speaker}」之间空白 ${s.start - last.end}ms`,
      });
    }
    if (!last || s.end > last.end) last = s;
  }

  // 翻译超时：阅读速度 = 非空白字符数 / 片段秒数
  for (const s of sorted) {
    const seconds = (s.end - s.start) / 1000;
    if (seconds <= 0) continue;
    for (const [lang, text] of Object.entries(s.texts)) {
      if (!text || !text.trim()) continue;
      const cps = nonSpaceLength(text) / seconds;
      if (cps > options.maxCps) {
        issues.push({
          id: `translation-timeout:${s.id}:${lang}`,
          kind: 'translation-timeout',
          segmentIds: [s.id],
          at: s.start,
          message: `「${s.speaker}」${lang} 译文约 ${cps.toFixed(1)} 字/秒，超过上限 ${options.maxCps}`,
        });
      }
    }
  }

  return issues.sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
}
