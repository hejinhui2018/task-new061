/**
 * CaptionFlow 领域模型
 *
 * Cue 是一条多语言字幕片段：携带时间码、发言人以及各语言译文。
 * 时间一律以毫秒为单位在内部流转，UI/导入导出时才与时间码字符串互转。
 */

export const SOURCE_LANG = 'en';
export const LANGUAGES = ['en', 'zh', 'es'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  zh: '中文',
  es: 'Español',
};

export interface Speaker {
  id: string;
  name: string;
  /** 用于时间轴轨道配色 */
  color: string;
}

export interface Cue {
  id: string;
  start: number;
  end: number;
  speakerId: string;
  /** language code -> 译文；源语言键始终存在 */
  text: Record<string, string>;
}

export interface Transcript {
  speakers: Speaker[];
  cues: Cue[];
}

/** 校验/分析得到的问题类型 */
export type IssueKind = 'overlap' | 'gap' | 'speakerConflict' | 'translationOverrun';

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  kind: IssueKind;
  severity: IssueSeverity;
  /** 主要涉及的 cue（受影响方） */
  cueId: string;
  /** 重叠/冲突时的另一方 */
  otherCueId?: string;
  message: string;
  /** 数值（毫秒）：重叠量 / 空白时长 / 超时量 */
  amount?: number;
  /** translationOverrun 对应的语言 */
  language?: LanguageCode;
}

/** 把空白视为问题的阈值，默认 1200ms */
export const DEFAULT_GAP_THRESHOLD = 1200;

/** 译文相对源文时长的允许超时比例，默认 20% */
export const DEFAULT_OVERRUN_RATIO = 0.2;

/** 每字符朗读时长基准（毫秒/字符），用于估算译文所需时长 */
export const READING_SPEED: Record<LanguageCode, number> = {
  en: 55,
  zh: 160,
  es: 60,
};
