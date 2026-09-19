import { useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { useStore } from '../state/store';
import { formatTimecode, formatDuration, clamp, snap } from '../domain/time';
import type { Cue } from '../domain/types';

type DragMode =
  | { kind: 'move'; cueId: string; pointerStartX: number; originalStart: number }
  | { kind: 'trim'; cueId: string; edge: 'start' | 'end'; pointerStartX: number; originalValue: number };

interface Draft {
  positions: Map<string, { start: number; end: number }>;
}

const SNAP_MS = 10;

export function Timeline() {
  const { transcript, issues, state, dispatch } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [constrain, setConstrain] = useState(false);
  const [scissorMode, setScissorMode] = useState(false);
  const drag = useRef<DragMode | null>(null);
  const draft = useRef<Draft | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [, force] = useState(0);

  const pxPerMs = pxPerSecond / 1000;
  const ordered = useMemo(
    () => [...transcript.cues].sort((a, b) => a.start - b.start),
    [transcript.cues],
  );
  const durationMs = useMemo(() => {
    const end = transcript.cues.reduce((m, c) => Math.max(m, c.end), 0);
    return Math.max(end + 4000, 10_000);
  }, [transcript.cues]);
  const canvasWidth = durationMs * pxPerMs;

  const overlapCueIds = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) {
      if (i.kind === 'overlap') {
        set.add(i.cueId);
        if (i.otherCueId) set.add(i.otherCueId);
      }
    }
    return set;
  }, [issues]);
  const overrunCueIds = useMemo(
    () => new Set(issues.filter((i) => i.kind === 'translationOverrun').map((i) => i.cueId)),
    [issues],
  );
  const gaps = useMemo(() => issues.filter((i) => i.kind === 'gap'), [issues]);

  const speakerColor = (id: string) =>
    transcript.speakers.find((s) => s.id === id)?.color ?? '#888';
  const speakerName = (id: string) => transcript.speakers.find((s) => s.id === id)?.name ?? id;

  function clientToMs(clientX: number): number {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left + el.scrollLeft) / pxPerMs;
  }

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    if (scissorMode) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = mode;
    draft.current = { positions: new Map() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dxMs = (e.clientX - d.pointerStartX) / pxPerMs;
    const positions = draft.current!.positions;
    if (d.kind === 'move') {
      const cue = ordered.find((c) => c.id === d.cueId)!;
      let start = snap(d.originalStart + dxMs, SNAP_MS);
      const dur = cue.end - cue.start;
      if (constrain) {
        const idx = ordered.findIndex((c) => c.id === d.cueId);
        const minStart = idx > 0 ? ordered[idx - 1].end : 0;
        const maxStart = idx < ordered.length - 1 ? ordered[idx + 1].start - dur : Infinity;
        start = clamp(start, minStart, Math.max(minStart, maxStart));
      } else {
        start = Math.max(0, start);
      }
      positions.set(d.cueId, { start, end: start + dur });
    } else {
      const cue = ordered.find((c) => c.id === d.cueId)!;
      const value = snap(d.originalValue + dxMs, SNAP_MS);
      const next = { ...cue };
      if (d.edge === 'start') next.start = clamp(value, 0, next.end - 250);
      else next.end = Math.max(next.start + 250, value);
      positions.set(d.cueId, { start: next.start, end: next.end });
    }
    setTip({ x: e.clientX + 12, y: e.clientY + 12, text: tipText(d, positions.get(d.cueId)!) });
    force((n) => n + 1);
  }

  function tipText(d: DragMode, p: { start: number; end: number }): string {
    if (d.kind === 'move') return `start ${formatTimecode(p.start)}`;
    return `${d.edge === 'start' ? '入点' : '出点'} ${formatTimecode(d.edge === 'start' ? p.start : p.end)}`;
  }

  function onPointerUp() {
    const d = drag.current;
    if (!d) return;
    const p = draft.current?.positions.get(d.cueId);
    if (p) {
      if (d.kind === 'move') {
        if (p.start !== ordered.find((c) => c.id === d.cueId)!.start) {
          dispatch({ type: 'move', cueId: d.cueId, startMs: p.start, options: { constrain, snapStep: SNAP_MS } });
        }
      } else {
        const original = ordered.find((c) => c.id === d.cueId)!;
        const value = d.edge === 'start' ? p.start : p.end;
        const originalValue = d.edge === 'start' ? original.start : original.end;
        if (value !== originalValue) {
          dispatch({ type: 'trim', cueId: d.cueId, edge: d.edge, valueMs: value });
        }
      }
    }
    drag.current = null;
    draft.current = null;
    setTip(null);
  }

  function onCueClick(e: React.MouseEvent, cue: Cue) {
    if (!scissorMode) {
      dispatch({ type: 'selectCue', cueId: cue.id });
      return;
    }
    const at = clientToMs(e.clientX);
    dispatch({ type: 'split', cueId: cue.id, atMs: Math.round(at) });
    setScissorMode(false);
  }

  const posOf = (cue: Cue) => draft.current?.positions.get(cue.id) ?? cue;
  const ticks = useMemo(() => {
    const step = niceStep(pxPerSecond);
    const out: { ms: number; label: string }[] = [];
    for (let ms = 0; ms <= durationMs; ms += step) {
      out.push({ ms, label: formatTimecode(ms).slice(3, 8) });
    }
    return out;
  }, [pxPerSecond, durationMs]);

  return (
    <div className="panel timeline-panel">
      <div className="timeline-toolbar">
        <span className="panel-title" style={{ border: 'none', padding: 0 }}>时间轴</span>
        <button onClick={() => setPxPerSecond((z) => Math.max(12, z - 15))}>−</button>
        <input
          type="range"
          min={12}
          max={150}
          value={pxPerSecond}
          onChange={(e) => setPxPerSecond(Number(e.target.value))}
          style={{ width: 110 }}
        />
        <button onClick={() => setPxPerSecond((z) => Math.min(150, z + 15))}>+</button>
        <span className="hint" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          {pxPerSecond}px/s · 总时长 {formatDuration(durationMs)}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <button
          className={constrain ? 'primary' : ''}
          title="开启后拖动不能越过相邻片段"
          onClick={() => setConstrain((v) => !v)}
        >
          防重叠拖动
        </button>
        <button
          className={scissorMode ? 'primary' : ''}
          title="开启后点击片段即可在点击处拆分"
          onClick={() => setScissorMode((v) => !v)}
        >
          ✂ 拆分模式{scissorMode ? '（开）' : ''}
        </button>
      </div>

      <div
        className="timeline-scroll"
        ref={scrollRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="timeline-canvas" style={{ width: canvasWidth, minWidth: '100%' }}>
          <div className="ruler" style={{ width: canvasWidth }}>
            {ticks.map((t) => (
              <div key={t.ms} className="tick" style={{ left: t.ms * pxPerMs }}>
                {t.label}
              </div>
            ))}
          </div>

          <div className="track" style={{ width: canvasWidth }}>
            {ordered.map((cue) => {
              const p = posOf(cue);
              const selected = state.selectedCueId === cue.id;
              const text = cue.text[state.language] ?? cue.text.en;
              return (
                <div
                  key={cue.id}
                  className={
                    'cue-block' +
                    (selected ? ' selected' : '') +
                    (overlapCueIds.has(cue.id) ? ' has-overlap' : '') +
                    (overrunCueIds.has(cue.id) ? ' has-overrun' : '')
                  }
                  style={{
                    left: p.start * pxPerMs,
                    width: Math.max((p.end - p.start) * pxPerMs, 4),
                    borderLeftColor: speakerColor(cue.speakerId),
                  }}
                  onPointerDown={(e) => {
                    dispatch({ type: 'selectCue', cueId: cue.id });
                    beginDrag({ kind: 'move', cueId: cue.id, pointerStartX: e.clientX, originalStart: p.start }, e);
                  }}
                  onClick={(e) => onCueClick(e, cue)}
                  title={`${cue.id} · ${speakerName(cue.speakerId)}\n${formatTimecode(cue.start)} → ${formatTimecode(cue.end)}`}
                >
                  {!scissorMode && (
                    <>
                      <div
                        className="edge left"
                        onPointerDown={(e) =>
                          beginDrag({ kind: 'trim', cueId: cue.id, edge: 'start', pointerStartX: e.clientX, originalValue: p.start }, e)
                        }
                      />
                      <div
                        className="edge right"
                        onPointerDown={(e) =>
                          beginDrag({ kind: 'trim', cueId: cue.id, edge: 'end', pointerStartX: e.clientX, originalValue: p.end }, e)
                        }
                      />
                    </>
                  )}
                  <div className="cue-head">
                    <span className="cue-speaker" style={{ color: speakerColor(cue.speakerId) }}>
                      {speakerName(cue.speakerId).split(/[（(]/)[0]}
                    </span>
                    <span>{cue.id}</span>
                  </div>
                  <div className="cue-text">{text}</div>
                </div>
              );
            })}

            {gaps.map((g) => {
              const a = ordered.find((c) => c.id === g.cueId)!;
              const b = ordered.find((c) => c.id === g.otherCueId)!;
              return (
                <div
                  key={`gap-${g.cueId}-${g.otherCueId}`}
                  className="gap-marker"
                  style={{ left: a.end * pxPerMs, width: (b.start - a.end) * pxPerMs }}
                >
                  <span>空白 {formatDuration(g.amount ?? 0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tip && (
        <div className="drag-time-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

function niceStep(pxPerSec: number): number {
  const targetPx = 90;
  const candidates = [500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000];
  return candidates.find((s) => s * (pxPerSec / 1000) >= targetPx) ?? 60_000;
}
