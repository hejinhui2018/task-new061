import { useMemo, useState } from 'react';
import type * as React from 'react';
import { useStore } from '../state/store';
import { formatTimecode, parseDurationInput, parseTimecode } from '../domain/time';
import {
  diffVersions,
  findVersion,
  listVersions,
  type VersionDiff,
} from '../domain/history';
import { LANGUAGE_LABELS } from '../domain/types';

export type ModalKind = 'delay' | 'shift' | 'versions';

export function Modals({ kind, onClose }: { kind: ModalKind | null; onClose: () => void }) {
  if (!kind) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {kind === 'delay' && <DelayModal onClose={onClose} />}
      {kind === 'shift' && <ShiftModal onClose={onClose} />}
      {kind === 'versions' && <VersionsModal onClose={onClose} />}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="modal">
      <header>
        {title}
        <button className="ghost" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="content">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}

function DelayModal({ onClose }: { onClose: () => void }) {
  const { transcript, state, dispatch } = useStore();
  const ordered = useMemo(() => [...transcript.cues].sort((a, b) => a.start - b.start), [transcript.cues]);
  const selected = state.selectedCueId;
  const [atInput, setAtInput] = useState(() => {
    const cue = ordered.find((c) => c.id === selected);
    return cue ? formatTimecode(cue.start) : '00:00:30,000';
  });
  const [durInput, setDurInput] = useState('2000');
  const [error, setError] = useState<string | null>(null);

  const atMs = parseTc(atInput);
  const duration = parseDurationInput(durInput);
  const affected = Number.isFinite(atMs) && duration !== null
    ? ordered.filter((c) => c.start >= atMs)
    : [];

  function submit() {
    if (!Number.isFinite(atMs)) {
      setError('起始时间码格式不正确，示例：00:00:30,000');
      return;
    }
    if (duration === null || duration <= 0) {
      setError('延迟时长需为正数，支持 2000 / 2000ms / 2s');
      return;
    }
    dispatch({ type: 'insertDelay', atMs, durationMs: duration });
    onClose();
  }

  return (
    <ModalShell
      title="插入延迟（连锁平移）"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            插入并平移 {affected.length} 条
          </button>
        </>
      }
    >
      <div className="form-row">
        <label>起始时刻</label>
        <input className="mono" type="text" value={atInput} onChange={(e) => setAtInput(e.target.value)} />
        <span className="hint">所有起点 ≥ 该时刻的片段整体后移</span>
      </div>
      <div className="form-row">
        <label>延迟时长</label>
        <input className="mono" type="text" value={durInput} onChange={(e) => setDurInput(e.target.value)} />
        <span className="hint">如 2000ms 或 2s</span>
      </div>
      {error && <div style={{ color: 'var(--error)', marginBottom: 10 }}>{error}</div>}
      <div className="hint" style={{ color: 'var(--text-dim)' }}>
        将连锁平移 <b style={{ color: 'var(--warning)' }}>{affected.length}</b> 条片段，
        从 {affected[0] ? formatTimecode(affected[0].start) : '—'} 开始；片段间相对间距保持不变。
      </div>
    </ModalShell>
  );
}

function ShiftModal({ onClose }: { onClose: () => void }) {
  const { transcript, state, dispatch } = useStore();
  const ordered = useMemo(() => [...transcript.cues].sort((a, b) => a.start - b.start), [transcript.cues]);
  const [scope, setScope] = useState<'all' | 'from' | 'selected'>(
    state.selectedCueId ? 'selected' : 'all',
  );
  const [fromId, setFromId] = useState(state.selectedCueId ?? ordered[0]?.id ?? '');
  const [deltaInput, setDeltaInput] = useState('500');
  const [error, setError] = useState<string | null>(null);

  const delta = parseDurationInput(deltaInput);
  const ids = useMemo(() => {
    if (scope === 'all') return ordered.map((c) => c.id);
    if (scope === 'from') {
      const threshold = ordered.find((c) => c.id === fromId)?.start ?? 0;
      return ordered.filter((c) => c.start >= threshold).map((c) => c.id);
    }
    return state.selectedCueId ? [state.selectedCueId] : [];
  }, [scope, fromId, ordered, state.selectedCueId]);

  function submit() {
    if (delta === null || delta === 0) {
      setError('平移量不能为 0，支持负数回收，如 -500 或 -0.5s');
      return;
    }
    if (ids.length === 0) {
      setError('没有选中的片段');
      return;
    }
    dispatch({ type: 'batchShift', cueIds: scope === 'from' ? undefined : ids, fromId: scope === 'from' ? fromId : undefined, deltaMs: delta });
    onClose();
  }

  return (
    <ModalShell
      title="批量平移"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            平移 {ids.length} 条
          </button>
        </>
      }
    >
      <div className="form-row">
        <label>范围</label>
        <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="all">全部片段</option>
          <option value="from">某条及其后全部</option>
          <option value="selected" disabled={!state.selectedCueId}>
            仅当前选中片段
          </option>
        </select>
        {scope === 'from' && (
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {ordered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {formatTimecode(c.start)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="form-row">
        <label>平移量</label>
        <input className="mono" type="text" value={deltaInput} onChange={(e) => setDeltaInput(e.target.value)} />
        <span className="hint">正数后移，负数前移；会自动钳制，任何片段不会早于 00:00:00,000</span>
      </div>
      {error && <div style={{ color: 'var(--error)', marginBottom: 10 }}>{error}</div>}
      <div className="hint" style={{ color: 'var(--text-dim)' }}>
        将影响 <b>{ids.length}</b> 条片段。
      </div>
    </ModalShell>
  );
}

function VersionsModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const versions = useMemo(() => listVersions(state.history).reverse(), [state.history]);
  const [compareId, setCompareId] = useState<string>(versions[versions.length - 1]?.versionId ?? 'v1');
  const current = state.history.present;
  const diff: VersionDiff | null = useMemo(() => {
    const from = findVersion(state.history, compareId);
    return from ? diffVersions(from, current) : null;
  }, [state.history, compareId, current]);

  return (
    <ModalShell
      title={`版本历史（共 ${versions.length} 个版本）`}
      onClose={onClose}
      footer={<button onClick={onClose}>关闭</button>}
    >
      <div style={{ marginBottom: 14 }}>
        {versions.map((v) => (
          <div key={v.versionId} className={`version-item ${v.versionId === current.versionId ? 'current' : ''}`}>
            <span className="vid">{v.versionId}</span>
            <div className="vlabel">
              {v.label}
              <div className="vtime">{new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })}</div>
            </div>
            {v.versionId !== current.versionId && (
              <>
                <button onClick={() => setCompareId(v.versionId)}>与当前对比</button>
                <button
                  className="primary"
                  onClick={() => {
                    dispatch({ type: 'restoreVersion', versionId: v.versionId });
                    onClose();
                  }}
                >
                  恢复此版本
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {diff && (
        <div>
          <div className="panel-title" style={{ padding: '0 0 8px', border: 'none' }}>
            对比：{diff.fromVersionId} → {diff.toVersionId}
            <span className="count">新增 {diff.added}</span>
            <span className="count">删除 {diff.removed}</span>
            <span className="count">修改 {diff.modified}</span>
          </div>
          {diff.changes.length === 0 && <div className="empty-hint">两个版本内容一致。</div>}
          {diff.changes.map((c) => (
            <div key={c.id} className="diff-block">
              <span className="did">{c.id}</span>
              <span className={`kind ${c.kind}`}>
                {c.kind === 'added' ? '新增' : c.kind === 'removed' ? '删除' : '修改'}
              </span>
              {c.time && (
                <div className="diff-line">
                  {formatTimecode(c.time.before.start)}–{formatTimecode(c.time.before.end)} →{' '}
                  {formatTimecode(c.time.after.start)}–{formatTimecode(c.time.after.end)}
                </div>
              )}
              {c.speaker && (
                <div className="diff-line">
                  发言人 {c.speaker.before} → {c.speaker.after}
                </div>
              )}
              {c.texts.map((t) => (
                <div key={t.language} className="diff-text">
                  <div className="old">
                    [{LANGUAGE_LABELS[t.language as keyof typeof LANGUAGE_LABELS] ?? t.language}] {t.before}
                  </div>
                  <div className="new">{t.after}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function parseTc(input: string): number {
  try {
    return parseTimecode(input);
  } catch {
    return Number.NaN;
  }
}
