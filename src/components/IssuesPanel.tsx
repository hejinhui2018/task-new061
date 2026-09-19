import { useMemo } from 'react';
import { useStore } from '../state/store';
import { formatTimecode } from '../domain/time';
import { LANGUAGE_LABELS } from '../domain/types';
import type { Issue } from '../domain/types';

const KIND_TEXT: Record<Issue['kind'], string> = {
  overlap: '时间重叠',
  gap: '空白间隙',
  speakerConflict: '发言人冲突',
  translationOverrun: '翻译超时',
};

export function IssuesPanel() {
  const { transcript, issues, dispatch } = useStore();

  const sorted = useMemo(() => {
    const startOf = (id: string) => transcript.cues.find((c) => c.id === id)?.start ?? 0;
    return [...issues].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return startOf(a.cueId) - startOf(b.cueId);
    });
  }, [issues, transcript.cues]);

  const errorCount = sorted.filter((i) => i.severity === 'error').length;

  return (
    <div className="panel" style={{ flex: '1 1 0' }}>
      <div className="panel-title">
        问题检查
        <span className="count">{sorted.length}</span>
        {errorCount > 0 && <span className="badge error">{errorCount} 错误</span>}
        {sorted.length === 0 && <span className="badge" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>全部通过</span>}
      </div>
      <div className="panel-body">
        {sorted.length === 0 ? (
          <div className="empty-hint">未发现重叠、空白、发言人冲突或翻译超时 ✓</div>
        ) : (
          sorted.map((issue, idx) => {
            const cue = transcript.cues.find((c) => c.id === issue.cueId);
            return (
              <div
                key={idx}
                className="issue-item"
                onClick={() => {
                  dispatch({ type: 'selectCue', cueId: issue.cueId });
                  document
                    .querySelector(`tr[data-cueid="${issue.cueId}"]`)
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }}
              >
                <span className={`issue-dot ${issue.severity}`} />
                <div>
                  <div className="msg">
                    {issue.message}
                    {issue.language && (
                      <span className={`issue-kind warning`}>{LANGUAGE_LABELS[issue.language]}</span>
                    )}
                    <span className={`issue-kind ${issue.severity}`}>{KIND_TEXT[issue.kind]}</span>
                  </div>
                  <div className="meta">
                    {issue.cueId}
                    {cue ? ` · ${formatTimecode(cue.start)} → ${formatTimecode(cue.end)}` : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
