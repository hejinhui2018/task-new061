import { useEffect, useRef, useState } from 'react';
import type { Segment } from '../core/types';
import { msToTimecode, timecodeToMs } from '../core/timecode';

interface SegmentTableProps {
  segments: Segment[];
  speakers: string[];
  activeLang: string;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onRetime: (id: string, start: number, end: number) => void;
  onText: (id: string, text: string) => void;
  onSpeaker: (id: string, speaker: string) => void;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
}

/** 时间码输入框：失焦/回车提交，Esc 取消；非法输入自动还原 */
function TimeInput({ ms, onCommit }: { ms: number; onCommit: (value: number) => void }) {
  const [value, setValue] = useState(() => msToTimecode(ms));
  const [editing, setEditing] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editing) setValue(msToTimecode(ms));
  }, [ms, editing]);

  const commit = () => {
    setEditing(false);
    if (cancelRef.current) {
      cancelRef.current = false;
      setValue(msToTimecode(ms));
      return;
    }
    const parsed = timecodeToMs(value);
    if (parsed === null || parsed === ms) {
      setValue(msToTimecode(ms));
    } else {
      onCommit(parsed);
    }
  };

  return (
    <input
      className="time-input"
      value={value}
      spellCheck={false}
      onFocus={() => setEditing(true)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** 多行文本框：失焦提交，内容未变不产生历史记录 */
function TextCell({ text, onCommit }: { text: string; onCommit: (value: string) => void }) {
  const [value, setValue] = useState(text);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setValue(text);
  }, [text, editing]);

  return (
    <textarea
      className="text-cell"
      rows={2}
      value={value}
      onFocus={() => setEditing(true)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (value !== text) onCommit(value);
      }}
    />
  );
}

export default function SegmentTable(props: SegmentTableProps) {
  const { segments, speakers, activeLang, selectedIds } = props;
  return (
    <div className="table-wrap">
      <table className="seg-table">
        <thead>
          <tr>
            <th>#</th>
            <th>开始</th>
            <th>结束</th>
            <th>时长</th>
            <th>说话人</th>
            <th>文本（{activeLang}）</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s, i) => (
            <tr
              key={s.id}
              id={`row-${s.id}`}
              className={selectedIds.includes(s.id) ? 'selected' : ''}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('input,textarea,select,button')) return;
                props.onSelect([s.id]);
              }}
            >
              <td className="muted">{i + 1}</td>
              <td>
                <TimeInput ms={s.start} onCommit={(v) => props.onRetime(s.id, v, s.end)} />
              </td>
              <td>
                <TimeInput ms={s.end} onCommit={(v) => props.onRetime(s.id, s.start, v)} />
              </td>
              <td className="muted">{((s.end - s.start) / 1000).toFixed(1)}s</td>
              <td>
                <select value={s.speaker} onChange={(e) => props.onSpeaker(s.id, e.target.value)}>
                  {speakers.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <TextCell text={s.texts[activeLang] ?? ''} onCommit={(v) => props.onText(s.id, v)} />
              </td>
              <td className="row-actions">
                <button onClick={() => props.onSplit(s.id)} title="在中点拆分，文本按时间比例分配">
                  拆分
                </button>
                <button className="danger" onClick={() => props.onDelete(s.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
