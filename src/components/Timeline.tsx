import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { IssueKind, Segment } from '../core/types';
import { msToTimecode } from '../core/timecode';

interface TimelineProps {
  segments: Segment[];
  speakers: string[];
  activeLang: string;
  selectedIds: string[];
  issueBySegment: Map<string, IssueKind>;
  onSelect: (ids: string[]) => void;
  onMove: (id: string, newStart: number) => void;
}

const SPEAKER_COLORS = ['#4f8cff', '#ff7a59', '#3ecf8e', '#c792ea', '#ffd166', '#64d8ff'];
const ISSUE_COLORS: Record<IssueKind, string> = {
  overlap: '#ff5c5c',
  'speaker-conflict': '#d946ef',
  'translation-timeout': '#fbbf24',
  gap: '#38bdf8',
};

function formatTick(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
}

interface DragState {
  id: string;
  startX: number;
  origStart: number;
  moved: boolean;
}

export default function Timeline({
  segments,
  speakers,
  activeLang,
  selectedIds,
  issueBySegment,
  onSelect,
  onMove,
}: TimelineProps) {
  const [pxPerSec, setPxPerSec] = useState(60);
  const [dragDelta, setDragDelta] = useState<{ id: string; deltaMs: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const duration = Math.max(60_000, ...segments.map((s) => s.end)) + 3000;
  const trackWidth = Math.ceil((duration / 1000) * pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += 1000) ticks.push(t);

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>, s: Segment) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: s.id, startX: e.clientX, origStart: s.start, moved: false };
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>, s: Segment) => {
    const d = dragRef.current;
    if (!d || d.id !== s.id) return;
    const deltaMs = ((e.clientX - d.startX) / pxPerSec) * 1000;
    if (Math.abs(deltaMs) > 30) d.moved = true;
    setDragDelta({ id: s.id, deltaMs });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, s: Segment) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragDelta(null);
    if (!d || d.id !== s.id) return;
    if (d.moved) {
      const raw = d.origStart + ((e.clientX - d.startX) / pxPerSec) * 1000;
      const snapped = Math.max(0, Math.round(raw / 100) * 100);
      if (snapped !== s.start) onMove(s.id, snapped);
    } else if (e.shiftKey) {
      onSelect(
        selectedIds.includes(s.id)
          ? selectedIds.filter((id) => id !== s.id)
          : [...selectedIds, s.id],
      );
    } else {
      onSelect([s.id]);
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDragDelta(null);
  };

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <span className="muted">缩放</span>
        <input
          type="range"
          min={20}
          max={160}
          value={pxPerSec}
          onChange={(e) => setPxPerSec(Number(e.target.value))}
          aria-label="时间轴缩放"
        />
        <span className="muted">{pxPerSec}px/秒</span>
      </div>

      <div className="timeline-scroll">
        <div className="timeline-inner">
          <div className="ruler-row">
            <div className="lane-label sticky-label" />
            <div className="ruler" style={{ width: trackWidth }}>
              {ticks.map((t) => (
                <span
                  key={t}
                  className={t % 5000 === 0 ? 'tick major' : 'tick'}
                  style={{ left: (t / 1000) * pxPerSec }}
                />
              ))}
              {ticks
                .filter((t) => t % 5000 === 0)
                .map((t) => (
                  <span key={`label-${t}`} className="tick-label" style={{ left: (t / 1000) * pxPerSec }}>
                    {formatTick(t)}
                  </span>
                ))}
            </div>
          </div>

          {speakers.map((speaker, lane) => {
            const color = SPEAKER_COLORS[lane % SPEAKER_COLORS.length];
            return (
              <div key={speaker} className="lane">
                <div className="lane-label sticky-label" style={{ color }}>
                  {speaker}
                </div>
                <div className="lane-track" style={{ width: trackWidth }}>
                  {segments
                    .filter((s) => s.speaker === speaker)
                    .map((s) => {
                      const delta = dragDelta?.id === s.id ? dragDelta.deltaMs : 0;
                      const shownStart = Math.max(0, s.start + delta);
                      const kind = issueBySegment.get(s.id);
                      const borderColor = kind ? ISSUE_COLORS[kind] : color;
                      const selected = selectedIds.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          id={`seg-${s.id}`}
                          className={`block${selected ? ' selected' : ''}${dragDelta?.id === s.id ? ' dragging' : ''}`}
                          style={{
                            left: (shownStart / 1000) * pxPerSec,
                            width: Math.max(8, ((s.end - s.start) / 1000) * pxPerSec),
                            borderColor,
                            background: `${color}1f`,
                          }}
                          title={`${s.speaker} · ${msToTimecode(s.start)} → ${msToTimecode(s.end)}\n${s.texts[activeLang] ?? ''}`}
                          onPointerDown={(e) => beginDrag(e, s)}
                          onPointerMove={(e) => moveDrag(e, s)}
                          onPointerUp={(e) => endDrag(e, s)}
                          onPointerCancel={cancelDrag}
                        >
                          <span className="block-time">{msToTimecode(shownStart).slice(3)}</span>
                          <span className="block-text">{(s.texts[activeLang] ?? '').slice(0, 18)}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
