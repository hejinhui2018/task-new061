import type { Issue, IssueOptions, Segment } from './types';
import { detectIssues } from './issues';
import { repairOverlaps, shiftSegmentIds, shiftSegmentsAfter } from './operations';

/** 可在工具面板上预览/应用的批量操作 */
export type Operation =
  | { type: 'insert-delay'; atMs: number; deltaMs: number }
  | { type: 'shift-segments'; ids: string[]; deltaMs: number }
  | { type: 'repair-overlaps' };

export function applyOperation(segments: Segment[], op: Operation): Segment[] {
  switch (op.type) {
    case 'insert-delay':
      return shiftSegmentsAfter(segments, op.atMs, op.deltaMs);
    case 'shift-segments':
      return shiftSegmentIds(segments, op.ids, op.deltaMs);
    case 'repair-overlaps':
      return repairOverlaps(segments).segments;
  }
}

export interface IssueSummary {
  overlap: number;
  gap: number;
  speakerConflict: number;
  translationTimeout: number;
  total: number;
}

export function summarizeIssues(issues: Issue[]): IssueSummary {
  const summary: IssueSummary = {
    overlap: 0,
    gap: 0,
    speakerConflict: 0,
    translationTimeout: 0,
    total: issues.length,
  };
  for (const issue of issues) {
    if (issue.kind === 'overlap') summary.overlap++;
    else if (issue.kind === 'gap') summary.gap++;
    else if (issue.kind === 'speaker-conflict') summary.speakerConflict++;
    else summary.translationTimeout++;
  }
  return summary;
}

/** 一次操作对时间轴的影响：前后问题数对比、新增/解决的问题、受影响的片段 */
export interface ImpactReport {
  /** 操作后的片段列表（预览结果，未提交） */
  result: Segment[];
  before: IssueSummary;
  after: IssueSummary;
  addedIssues: Issue[];
  resolvedIssues: Issue[];
  affectedSegmentIds: string[];
}

export function previewOperation(
  segments: Segment[],
  op: Operation,
  options: IssueOptions,
): ImpactReport {
  const result = applyOperation(segments, op);
  const beforeIssues = detectIssues(segments, options);
  const afterIssues = detectIssues(result, options);
  const beforeIds = new Set(beforeIssues.map((i) => i.id));
  const afterIds = new Set(afterIssues.map((i) => i.id));

  const beforeById = new Map(segments.map((s) => [s.id, s]));
  const resultIds = new Set(result.map((s) => s.id));
  const changed = result
    .filter((s) => {
      const prev = beforeById.get(s.id);
      return !prev || prev.start !== s.start || prev.end !== s.end;
    })
    .map((s) => s.id);
  const removed = segments.filter((s) => !resultIds.has(s.id)).map((s) => s.id);

  return {
    result,
    before: summarizeIssues(beforeIssues),
    after: summarizeIssues(afterIssues),
    addedIssues: afterIssues.filter((i) => !beforeIds.has(i.id)),
    resolvedIssues: beforeIssues.filter((i) => !afterIds.has(i.id)),
    affectedSegmentIds: [...changed, ...removed],
  };
}
