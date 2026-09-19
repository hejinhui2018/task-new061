import { useMemo, useState } from 'react';
import type { Version } from '../core/versions';
import { diffVersions } from '../core/versions';
import { msToTimecode } from '../core/timecode';

interface VersionsPanelProps {
  versions: Version[];
  onSave: (label: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function VersionsPanel({ versions, onSave, onRestore, onDelete }: VersionsPanelProps) {
  const [label, setLabel] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const toggleCompare = (id: string) =>
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id]));

  const diff = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = versions.find((v) => v.id === compareIds[0]);
    const b = versions.find((v) => v.id === compareIds[1]);
    return a && b ? { a, b, changes: diffVersions(a, b) } : null;
  }, [compareIds, versions]);

  const save = () => {
    onSave(label.trim() || `版本 ${versions.length + 1}`);
    setLabel('');
  };

  return (
    <div className="versions-panel">
      <div className="version-save">
        <input
          placeholder={`版本 ${versions.length + 1}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button className="primary" onClick={save}>
          保存快照
        </button>
      </div>

      {versions.length === 0 ? (
        <p className="muted">还没有版本。大改前存一个快照，随时对比与回滚。</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id} className={compareIds.includes(v.id) ? 'comparing' : ''}>
              <label className="version-compare" title="勾选两个版本进行对比">
                <input
                  type="checkbox"
                  checked={compareIds.includes(v.id)}
                  onChange={() => toggleCompare(v.id)}
                />
              </label>
              <div className="version-meta">
                <strong>{v.label}</strong>
                <span className="muted">
                  {new Date(v.createdAt).toLocaleString()} · {v.segments.length} 段
                </span>
              </div>
              <div className="version-actions">
                <button onClick={() => onRestore(v.id)} title="回滚到该版本（可撤销）">
                  恢复
                </button>
                <button className="danger" onClick={() => onDelete(v.id)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {diff && (
        <div className="diff-view">
          <h4>
            对比：{diff.a.label} → {diff.b.label}
          </h4>
          {diff.changes.length === 0 ? (
            <p className="ok-line">✓ 两个版本完全一致</p>
          ) : (
            <ul>
              {diff.changes.map((c) => (
                <li key={c.id}>
                  <span className={`badge badge-${c.kind}`}>
                    {c.kind === 'added' ? '新增' : c.kind === 'removed' ? '删除' : '修改'}
                  </span>
                  <span className="diff-who">
                    {c.speaker} · {c.id}
                  </span>
                  {c.kind === 'added' && c.after && (
                    <span className="muted">@ {msToTimecode(c.after.start)}</span>
                  )}
                  {c.kind === 'removed' && c.before && (
                    <span className="muted">@ {msToTimecode(c.before.start)}</span>
                  )}
                  {c.kind === 'changed' && (
                    <span className="muted">
                      {c.timeShiftMs ? ` 平移 ${c.timeShiftMs > 0 ? '+' : ''}${(c.timeShiftMs / 1000).toFixed(1)}s` : ''}
                      {c.durationChangeMs
                        ? ` 时长 ${c.durationChangeMs > 0 ? '+' : ''}${(c.durationChangeMs / 1000).toFixed(1)}s`
                        : ''}
                      {c.speakerChanged && c.before ? ` 说话人 ${c.before.speaker}→${c.speaker}` : ''}
                    </span>
                  )}
                  {c.textChanges?.map((t) => (
                    <div key={t.lang} className="text-diff">
                      <span className="lang">{t.lang}</span>
                      <del>{t.before || '（空）'}</del>
                      <ins>{t.after || '（空）'}</ins>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
