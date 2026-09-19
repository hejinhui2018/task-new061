import { useStore } from '../state/store';
import { formatTimecode, formatDelta } from '../domain/time';
import type { Issue } from '../domain/types';

function counts(issues: Issue[]) {
  return {
    overlap: issues.filter((i) => i.kind === 'overlap').length,
    gap: issues.filter((i) => i.kind === 'gap').length,
    speaker: issues.filter((i) => i.kind === 'speakerConflict').length,
    overrun: issues.filter((i) => i.kind === 'translationOverrun').length,
  };
}

export function ImpactPanel() {
  const { state } = useStore();
  const op = state.lastOp;

  if (!op) {
    return (
      <div className="panel" style={{ flex: '0 0 auto', maxHeight: 210 }}>
        <div className="panel-title">调整影响</div>
        <div className="empty-hint">
          拖动、裁剪、拆分、插入延迟或批量平移后，这里会显示受影响片段以及问题数量的前后对比。
        </div>
      </div>
    );
  }

  const before = counts(op.issuesBefore);
  const after = counts(op.issuesAfter);
  const totalBefore = op.issuesBefore.length;
  const totalAfter = op.issuesAfter.length;
  const totalClass = totalAfter < totalBefore ? 'good' : totalAfter > totalBefore ? 'bad' : '';

  return (
    <div className="panel" style={{ flex: '0 0 auto', maxHeight: 260 }}>
      <div className="panel-title">
        调整影响 · {op.label}
        <span className="count">{op.impacted.length} 条受影响</span>
      </div>
      <div className="panel-body">
        <div className="impact-summary">
          <span className={`stat ${totalClass}`}>
            问题 {totalBefore} → {totalAfter}
          </span>
          <DeltaStat label="重叠" before={before.overlap} after={after.overlap} />
          <DeltaStat label="空白" before={before.gap} after={after.gap} />
          <DeltaStat label="发言人" before={before.speaker} after={after.speaker} />
          <DeltaStat label="翻译超时" before={before.overrun} after={after.overrun} />
        </div>
        {op.impacted.length === 0 && (
          <div className="empty-hint" style={{ padding: '10px 16px' }}>本次操作未改变时间码。</div>
        )}
        {op.impacted.map((hit) => {
          const delta = hit.before && hit.after ? hit.after.start - hit.before.start : 0;
          return (
            <div key={hit.id} className={`impact-row ${hit.added ? 'added' : ''}`}>
              <span className="id">{hit.added ? '＋' : hit.after === null ? '－' : ''} {hit.id}</span>
              <span className="times">
                {hit.before ? (
                  <>
                    {formatTimecode(hit.before.start)}–{formatTimecode(hit.before.end)}
                    <span className="arrow">→</span>
                  </>
                ) : (
                  '新增 '
                )}
                {hit.after ? (
                  <>
                    {formatTimecode(hit.after.start)}–{formatTimecode(hit.after.end)}
                    {delta !== 0 && (
                      <span className={`delta ${delta > 0 ? 'pos' : 'neg'}`}>{formatDelta(delta)}</span>
                    )}
                  </>
                ) : (
                  '已删除'
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaStat({ label, before, after }: { label: string; before: number; after: number }) {
  if (before === after) {
    return (
      <span className="stat">
        {label} {after}
      </span>
    );
  }
  const cls = after < before ? 'good' : 'bad';
  return (
    <span className={`stat ${cls}`}>
      {label} {before}→{after}
    </span>
  );
}
