/** 字幕片段：时间单位为毫秒，texts 按语言代码存放多语言文本 */
export interface Segment {
  id: string;
  start: number;
  end: number;
  speaker: string;
  texts: Record<string, string>;
}

export interface CaptionDoc {
  title: string;
  languages: string[];
  speakers: string[];
  segments: Segment[];
}

export type IssueKind = 'overlap' | 'gap' | 'speaker-conflict' | 'translation-timeout';

export interface Issue {
  id: string;
  kind: IssueKind;
  segmentIds: string[];
  /** 问题发生的位置（毫秒），用于定位与排序 */
  at: number;
  message: string;
}

export interface IssueOptions {
  /** 相邻片段间隔超过该值视为“空白” */
  gapThresholdMs: number;
  /** 译文阅读速度上限（字/秒），超过视为“翻译超时” */
  maxCps: number;
}

export const DEFAULT_ISSUE_OPTIONS: IssueOptions = {
  gapThresholdMs: 2000,
  maxCps: 20,
};
