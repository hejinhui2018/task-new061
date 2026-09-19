import { useMemo } from 'react';
import type { Issue, IssueKind, IssueOptions } from '../core/types';
import { msToTimecode } from '../core/timecode';

const KIND_META: Record<IssueKind, { label: string; icon: string }> = {
  overlap: { label: '时间重叠', icon: '⧉' },
  gap: { label: '空白', icon: '⋯' },
  'speaker-conflict': { label: '说话人冲突', icon: '⚡' },
  'translation-timeout': { label: '翻译超时', icon: '⏱' },
};

interface IssuesPanelProps {
  issues: Issue[];
  options: IssueOptions;
  onOptionsChange: (options: IssueOptions) => void;
  onLocate: (segmentIds: string[]) => void;
}

export default function IssuesPanel({ issues, options, onOptionsChange, onLocate }: IssuesPanelProps) {
  const counts = useMemo(() => {
    const c: Record<IssueKind, number> = {
      overlap: 0,
      gap: 0,
      'speaker-conflict': 0,
      'translation-timeout': 0,
    };
    for (const issue of issues) c[issue.kind]++;
    return c;
  }, [issues]);

  return (
    <div className="issues-panel">
      <div className="issue-summary">
        {(Object.keys(KIND_META) as IssueKind[]).map((kind) => (
          <span key={kind} className={`chip chip-${kind}${counts[kind] > 0 ? ' has' : ''}`}>
            {KIND_META[kind].icon} {KIND_META[kind].label} {counts[kind]}
          </span>
        ))}
      </div>

      <div className="issue-options">
        <label>
          空白阈值(ms)
          <input
            type="number"
            min={0}
            step={100}
            value={options.gapThresholdMs}
            onChange={(e) => onOptionsChange({ ...options, gapThresholdMs: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label>
          阅读上限(字/秒)
          <input
            type="number"
            min={1}
            step={1}
            value={options.maxCps}
            onChange={(e) => onOptionsChange({ ...options, maxCps: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
      </div>

      {issues.length === 0 ? (
        <p className="ok-line">✓ 当前参数下未发现问题</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button className={`issue-item issue-${issue.kind}`} onClick={() => onLocate(issue.segmentIds)}>
                <span className="issue-icon">{KIND_META[issue.kind].icon}</span>
                <span className="issue-body">
                  <span className="issue-message">{issue.message}</span>
                  <span className="issue-at">@ {msToTimecode(issue.at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
