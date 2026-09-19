import {
  DEFAULT_GAP_THRESHOLD,
  DEFAULT_OVERRUN_RATIO,
  READING_SPEED,
  type Cue,
  type Issue,
  type LanguageCode,
  type Transcript,
} from './types';
import { overlapAmount } from './time';

export interface AnalysisOptions {
  /** 超过该时长的相邻片段间隙才报告，默认 1200ms */
  gapThreshold?: number;
  /** 译文允许超出朗读预算的比例，默认 0.2 */
  overrunRatio?: number;
  /** 需要检查超时的语言；默认除源语言外全部检查 */
  languages?: LanguageCode[];
}

/**
 * 分析整份时间轴，返回问题列表（按时间顺序）。
 * 纯函数：同样的输入必然得到同样的输出，便于在操作前后各跑一次做影响对比。
 */
export function analyze(transcript: Transcript, options: AnalysisOptions = {}): Issue[] {
  const gapThreshold = options.gapThreshold ?? DEFAULT_GAP_THRESHOLD;
  const overrunRatio = options.overrunRatio ?? DEFAULT_OVERRUN_RATIO;
  const langs = options.languages ?? (['zh', 'es'] as LanguageCode[]);

  const cues = [...transcript.cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const issues: Issue[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const speaker = transcript.speakers.find((s) => s.id === cue.speakerId);

    // 1) 译文超时（与时间轴位置无关，逐句检查）
    for (const lang of langs) {
      const overrun = translationOverrun(cue, lang, overrunRatio);
      if (overrun > 0) {
        issues.push({
          kind: 'translationOverrun',
          severity: 'warning',
          cueId: cue.id,
          language: lang,
          amount: overrun,
          message: `${lang.toUpperCase()} 译文朗读需多 ${Math.round(overrun)}ms，当前片段可能显示过短`,
        });
      }
    }

    // 2) 与后续片段的关系：重叠 / 同发言人跨句 / 空白
    for (let j = i + 1; j < cues.length; j++) {
      const other = cues[j];
      if (other.start >= cue.end) {
        // 已按 start 排序；再往后只会更晚，只需对“紧邻的下一条”检查空白
        if (j === i + 1) {
          const gap = other.start - cue.end;
          if (gap > gapThreshold) {
            issues.push({
              kind: 'gap',
              severity: 'warning',
              cueId: cue.id,
              otherCueId: other.id,
              amount: gap,
              message: `与下一条之间有 ${Math.round(gap)}ms 空白`,
            });
          }
          if (cue.speakerId === other.speakerId) {
            issues.push(speakerConflict(other, cue, speaker?.name ?? cue.speakerId, '相邻两句归属同一发言人'));
          }
        }
        break;
      }
      const amount = overlapAmount(cue.start, cue.end, other.start, other.end);
      if (amount > 0) {
        issues.push({
          kind: 'overlap',
          severity: 'error',
          cueId: other.id,
          otherCueId: cue.id,
          amount,
          message:
            cue.speakerId === other.speakerId
              ? `与上一条时间重叠 ${Math.round(amount)}ms（同一发言人不能重叠）`
              : `与上一条时间重叠 ${Math.round(amount)}ms（跨发言人抢话）`,
        });
        if (cue.speakerId === other.speakerId) {
          issues.push(speakerConflict(other, cue, speaker?.name ?? cue.speakerId, '重叠片段归属同一发言人'));
        }
      }
    }
  }

  return issues;
}

function speakerConflict(cue: Cue, other: Cue, name: string, reason: string): Issue {
  return {
    kind: 'speakerConflict',
    severity: 'warning',
    cueId: cue.id,
    otherCueId: other.id,
    message: `${name}：${reason}，请确认是否应合并或更换发言人标签`,
  };
}

/**
 * 译文超时毫秒数：按字符数 × 语言朗读速度估算所需时长，
 * 超过 片段时长 × (1 + overrunRatio) 的部分即为超时量；未超时返回 0。
 * 相邻边界（预算恰好等于需求）返回 0。
 */
export function translationOverrun(
  cue: Cue,
  language: LanguageCode,
  overrunRatio = DEFAULT_OVERRUN_RATIO,
): number {
  const text = cue.text[language];
  if (!text || !text.trim()) return 0;
  const duration = Math.max(0, cue.end - cue.start);
  const budget = duration * (1 + overrunRatio);
  const required = text.length * READING_SPEED[language];
  return Math.max(0, required - budget);
}

/** 便捷分组：cueId -> 该片段上的问题 */
export function issuesByCue(issues: Issue[]): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = map.get(issue.cueId) ?? [];
    list.push(issue);
    map.set(issue.cueId, list);
  }
  return map;
}
