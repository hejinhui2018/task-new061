import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { formatTimecode } from '../domain/time';
import { issuesByCue } from '../domain/analyze';
import { LANGUAGE_LABELS } from '../domain/types';
import type { Issue } from '../domain/types';

const ISSUE_LABEL: Record<Issue['kind'], string> = {
  overlap: '重叠',
  gap: '空白',
  speakerConflict: '发言人待确认',
  translationOverrun: '翻译超时',
};

export function CueTable() {
  const { transcript, issues, state, dispatch } = useStore();
  const ordered = useMemo(() => [...transcript.cues].sort((a, b) => a.start - b.start), [transcript.cues]);
  const byCue = useMemo(() => issuesByCue(issues), [issues]);

  return (
    <div className="panel table-panel">
      <div className="panel-title">
        片段列表
        <span className="count">{ordered.length} 条 · 当前语言 {LANGUAGE_LABELS[state.language]}</span>
      </div>
      <div className="panel-body">
        <table className="cue-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th style={{ width: 180 }}>时间码</th>
              <th style={{ width: 150 }}>发言人</th>
              <th>文本（{LANGUAGE_LABELS[state.language]}）</th>
              <th style={{ width: 150 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((cue, i) => {
              const cueIssues = byCue.get(cue.id) ?? [];
              const selected = state.selectedCueId === cue.id;
              return (
                <tr
                  key={cue.id}
                  data-cueid={cue.id}
                  className={selected ? 'selected' : ''}
                  onClick={() => dispatch({ type: 'selectCue', cueId: cue.id })}
                >
                  <td className="tc">{i + 1}</td>
                  <td className="tc">
                    {formatTimecode(cue.start)}
                    <br />
                    <span style={{ color: 'var(--text-faint)' }}>→ {formatTimecode(cue.end)}</span>
                    {cueIssues.length > 0 && (
                      <div style={{ marginTop: 3 }}>
                        {cueIssues.map((iss, k) => (
                          <span key={k} className={`badge ${iss.severity}`} title={iss.message}>
                            {ISSUE_LABEL[iss.kind]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <SpeakerSelect cueId={cue.id} speakerId={cue.speakerId} />
                  </td>
                  <td>
                    <TextEditor cueId={cue.id} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        title="在片段中点拆分"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'split', cueId: cue.id, atMs: Math.round((cue.start + cue.end) / 2) });
                        }}
                      >
                        ✂ 拆分
                      </button>
                      {cueIssues.some((x) => x.kind === 'overlap') && (
                        <>
                          <button
                            className="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'repair', cueId: cue.id, mode: 'trim' });
                            }}
                          >
                            裁切修复
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'repair', cueId: cue.id, mode: 'ripple' });
                            }}
                          >
                            右推修复
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpeakerSelect({ cueId, speakerId }: { cueId: string; speakerId: string }) {
  const { transcript, dispatch } = useStore();
  return (
    <select
      value={speakerId}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => dispatch({ type: 'changeSpeaker', cueId, speakerId: e.target.value })}
    >
      {transcript.speakers.map((s) => (
        <option key={s.id} value={s.id}>
          ● {s.name}
        </option>
      ))}
    </select>
  );
}

function TextEditor({ cueId }: { cueId: string }) {
  const { transcript, state, dispatch } = useStore();
  const cue = transcript.cues.find((c) => c.id === cueId)!;
  const lang = state.language;
  const value = cue.text[lang] ?? '';
  const [draft, setDraft] = useState<string | null>(null);

  // 切换语言/片段时放弃未提交草稿
  const editingKey = `${cueId}:${lang}`;
  const [lastKey, setLastKey] = useState(editingKey);
  if (lastKey !== editingKey) {
    setLastKey(editingKey);
    setDraft(null);
  }

  return (
    <textarea
      value={draft ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) {
          dispatch({ type: 'editText', cueId, language: lang, text: draft });
        }
        setDraft(null);
      }}
    />
  );
}
