import { useMemo, useState } from 'react';
import type { IssueOptions, Segment } from '../core/types';
import type { ImpactReport, Operation } from '../core/impact';
import { previewOperation } from '../core/impact';
import { timecodeToMs } from '../core/timecode';
import ImpactView from './ImpactView';

interface ToolsPanelProps {
  segments: Segment[];
  selectedIds: string[];
  issueOptions: IssueOptions;
  onApply: (label: string, op: Operation) => void;
}

function usePreview(
  segments: Segment[],
  op: Operation | null,
  options: IssueOptions,
): ImpactReport | null {
  return useMemo(
    () => (op ? previewOperation(segments, op, options) : null),
    [segments, op, options],
  );
}

export default function ToolsPanel({ segments, selectedIds, issueOptions, onApply }: ToolsPanelProps) {
  // 插入延迟
  const [delayAt, setDelayAt] = useState('00:00:30,000');
  const [delaySec, setDelaySec] = useState('2');
  // 批量平移
  const [shiftScope, setShiftScope] = useState<'selected' | 'after'>('selected');
  const [shiftAt, setShiftAt] = useState('00:00:10,000');
  const [shiftSec, setShiftSec] = useState('1.5');

  // ---- 插入延迟预览 ----
  const delayAtMs = timecodeToMs(delayAt);
  const delayDeltaSec = Number(delaySec);
  const delayError =
    delayAtMs === null
      ? '起始时间码无效'
      : !Number.isFinite(delayDeltaSec) || delayDeltaSec === 0
        ? '延迟秒数需为非零数字'
        : null;
  const delayOp: Operation | null =
    delayError === null && delayAtMs !== null
      ? { type: 'insert-delay', atMs: delayAtMs, deltaMs: Math.round(delayDeltaSec * 1000) }
      : null;
  const delayPreview = usePreview(segments, delayOp, issueOptions);
  const delayNegative = delayPreview?.result.some((s) => s.start < 0) ?? false;

  // ---- 批量平移预览 ----
  const shiftAtMs = timecodeToMs(shiftAt);
  const shiftDeltaSec = Number(shiftSec);
  const shiftIds =
    shiftScope === 'selected'
      ? selectedIds
      : shiftAtMs === null
        ? []
        : segments.filter((s) => s.start >= shiftAtMs).map((s) => s.id);
  const shiftError =
    shiftScope === 'after' && shiftAtMs === null
      ? '起始时间码无效'
      : !Number.isFinite(shiftDeltaSec) || shiftDeltaSec === 0
        ? '平移量需为非零数字'
        : shiftIds.length === 0
          ? shiftScope === 'selected'
            ? '请先在时间轴或列表中选择片段'
            : '该时间之后没有片段'
          : null;
  const shiftOp: Operation | null =
    shiftError === null ? { type: 'shift-segments', ids: shiftIds, deltaMs: Math.round(shiftDeltaSec * 1000) } : null;
  const shiftPreview = usePreview(segments, shiftOp, issueOptions);
  const shiftNegative = shiftPreview?.result.some((s) => s.start < 0) ?? false;

  // ---- 重叠修复预览 ----
  const repairOp: Operation = { type: 'repair-overlaps' };
  const repairPreview = usePreview(segments, repairOp, issueOptions);
  const overlapCount = (repairPreview?.before.overlap ?? 0) + (repairPreview?.before.speakerConflict ?? 0);

  return (
    <div className="tools-panel">
      <section className="tool">
        <h3>插入延迟（连锁平移）</h3>
        <div className="tool-row">
          <label>
            从时间
            <input className="time-input" value={delayAt} onChange={(e) => setDelayAt(e.target.value)} spellCheck={false} />
          </label>
          <label>
            延迟(秒)
            <input type="number" step={0.1} value={delaySec} onChange={(e) => setDelaySec(e.target.value)} />
          </label>
        </div>
        {delayError ? (
          <p className="error-line">{delayError}</p>
        ) : delayNegative ? (
          <p className="error-line">该操作会把片段移到 0 之前，已阻止</p>
        ) : (
          delayPreview && <ImpactView report={delayPreview} />
        )}
        <button
          className="primary"
          disabled={!delayOp || delayNegative}
          onClick={() => delayOp && onApply(`插入延迟 ${delaySec}s @ ${delayAt}`, delayOp)}
        >
          应用插入延迟
        </button>
      </section>

      <section className="tool">
        <h3>批量平移</h3>
        <div className="tool-row">
          <label>
            范围
            <select value={shiftScope} onChange={(e) => setShiftScope(e.target.value as 'selected' | 'after')}>
              <option value="selected">选中片段（{selectedIds.length}）</option>
              <option value="after">某时间起全部</option>
            </select>
          </label>
          {shiftScope === 'after' && (
            <label>
              从时间
              <input className="time-input" value={shiftAt} onChange={(e) => setShiftAt(e.target.value)} spellCheck={false} />
            </label>
          )}
          <label>
            平移(秒)
            <input type="number" step={0.1} value={shiftSec} onChange={(e) => setShiftSec(e.target.value)} />
          </label>
        </div>
        {shiftError ? (
          <p className="error-line">{shiftError}</p>
        ) : shiftNegative ? (
          <p className="error-line">该操作会把片段移到 0 之前，已阻止</p>
        ) : (
          shiftPreview && <ImpactView report={shiftPreview} />
        )}
        <button
          className="primary"
          disabled={!shiftOp || shiftNegative}
          onClick={() => shiftOp && onApply(`批量平移 ${shiftSec}s（${shiftIds.length} 段）`, shiftOp)}
        >
          应用批量平移
        </button>
      </section>

      <section className="tool">
        <h3>重叠修复</h3>
        <p className="muted">把每个重叠前段的结束时间截到下一段起点；截空（&lt;1ms）的片段会被移除。</p>
        {overlapCount === 0 ? (
          <p className="ok-line">✓ 当前没有重叠</p>
        ) : (
          repairPreview && <ImpactView report={repairPreview} />
        )}
        <button className="primary" disabled={overlapCount === 0} onClick={() => onApply('修复重叠', repairOp)}>
          应用重叠修复
        </button>
      </section>
    </div>
  );
}
