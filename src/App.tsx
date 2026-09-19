import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { CaptionDoc, IssueKind, IssueOptions, Segment } from './core/types';
import { DEFAULT_ISSUE_OPTIONS } from './core/types';
import type { Clock } from './core/clock';
import { systemClock } from './core/clock';
import type { History } from './core/history';
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo as historyRedo,
  undo as historyUndo,
} from './core/history';
import type { Version } from './core/versions';
import { createVersion } from './core/versions';
import { detectIssues } from './core/issues';
import type { Operation } from './core/impact';
import { applyOperation } from './core/impact';
import { loadSession, saveSession } from './core/storage';
import { buildSampleDoc } from './core/sample';
import { parseImportedSegments, parseSrt, toSrt } from './core/importers';
import {
  moveSegmentTo,
  removeSegment,
  retimeSegment,
  sortByStart,
  splitSegment,
  updateSegmentSpeaker,
  updateSegmentText,
} from './core/operations';
import Timeline from './components/Timeline';
import SegmentTable from './components/SegmentTable';
import IssuesPanel from './components/IssuesPanel';
import ToolsPanel from './components/ToolsPanel';
import VersionsPanel from './components/VersionsPanel';

const STORAGE_KEY = 'captionflow.session.v1';
const LANG_LABEL: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };

interface AppState {
  doc: CaptionDoc;
  history: History<CaptionDoc>;
  versions: Version[];
  selectedIds: string[];
  activeLang: string;
  issueOptions: IssueOptions;
  /** 从本地存储恢复会话时的保存时间；null 表示全新会话 */
  restoredAt: number | null;
}

type Action =
  | { type: 'commit'; label: string; at: number; mutate: (doc: CaptionDoc) => CaptionDoc }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save-version'; id: string; label: string; at: number }
  | { type: 'restore-version'; id: string; at: number }
  | { type: 'delete-version'; id: string }
  | { type: 'select'; ids: string[] }
  | { type: 'set-lang'; lang: string }
  | { type: 'set-issue-options'; options: IssueOptions }
  | { type: 'replace-all'; doc: CaptionDoc; label: string; at: number }
  | { type: 'dismiss-restored' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'commit': {
      const nextDoc = action.mutate(state.doc);
      if (nextDoc === state.doc) return state;
      return {
        ...state,
        doc: nextDoc,
        history: pushHistory(state.history, { state: nextDoc, label: action.label, at: action.at }),
      };
    }
    case 'undo': {
      const history = historyUndo(state.history);
      return { ...state, history, doc: history.present.state };
    }
    case 'redo': {
      const history = historyRedo(state.history);
      return { ...state, history, doc: history.present.state };
    }
    case 'save-version': {
      const version = createVersion(state.doc.segments, action.label, () => action.at, action.id);
      return { ...state, versions: [...state.versions, version] };
    }
    case 'restore-version': {
      const version = state.versions.find((v) => v.id === action.id);
      if (!version) return state;
      const nextDoc: CaptionDoc = {
        ...state.doc,
        segments: version.segments.map((s) => ({ ...s, texts: { ...s.texts } })),
      };
      return {
        ...state,
        doc: nextDoc,
        history: pushHistory(state.history, {
          state: nextDoc,
          label: `恢复版本「${version.label}」`,
          at: action.at,
        }),
      };
    }
    case 'delete-version':
      return { ...state, versions: state.versions.filter((v) => v.id !== action.id) };
    case 'select':
      return { ...state, selectedIds: action.ids };
    case 'set-lang':
      return { ...state, activeLang: action.lang };
    case 'set-issue-options':
      return { ...state, issueOptions: action.options };
    case 'replace-all':
      return {
        ...state,
        doc: action.doc,
        history: initHistory({ state: action.doc, label: action.label, at: action.at }),
        versions: [],
        selectedIds: [],
        activeLang: action.doc.languages[0] ?? 'zh',
        restoredAt: null,
      };
    case 'dismiss-restored':
      return { ...state, restoredAt: null };
  }
}

function initState(clock: Clock): AppState {
  const saved = loadSession(window.localStorage, STORAGE_KEY);
  const doc = saved?.doc ?? buildSampleDoc();
  return {
    doc,
    history: initHistory({ state: doc, label: saved ? '恢复本地会话' : '载入内置示例', at: clock() }),
    versions: saved?.versions ?? [],
    selectedIds: [],
    activeLang: doc.languages[0] ?? 'zh',
    issueOptions: DEFAULT_ISSUE_OPTIONS,
    restoredAt: saved?.savedAt ?? null,
  };
}

export default function App({ clock = systemClock }: { clock?: Clock }) {
  const [state, dispatch] = useReducer(reducer, clock, initState);
  const fileRef = useRef<HTMLInputElement>(null);

  // 自动保存：文档或版本变化即写入 localStorage（刷新恢复）
  useEffect(() => {
    saveSession(window.localStorage, STORAGE_KEY, state.doc, state.versions, clock);
  }, [state.doc, state.versions, clock]);

  // Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commit = useCallback(
    (label: string, mutate: (doc: CaptionDoc) => CaptionDoc) => {
      dispatch({ type: 'commit', label, at: clock(), mutate });
    },
    [clock],
  );

  const issues = useMemo(
    () => detectIssues(state.doc.segments, state.issueOptions),
    [state.doc.segments, state.issueOptions],
  );

  // 每个片段最严重的问题类别（用于时间轴着色）
  const issueBySegment = useMemo(() => {
    const priority: Record<IssueKind, number> = {
      'speaker-conflict': 3,
      overlap: 2,
      'translation-timeout': 1,
      gap: 0,
    };
    const map = new Map<string, IssueKind>();
    for (const issue of issues) {
      for (const id of issue.segmentIds) {
        const current = map.get(id);
        if (!current || priority[issue.kind] > priority[current]) map.set(id, issue.kind);
      }
    }
    return map;
  }, [issues]);

  const sortedSegments = useMemo(() => sortByStart(state.doc.segments), [state.doc.segments]);

  // ---- 片段级操作 ----
  const handleMove = (id: string, newStart: number) =>
    commit('拖动片段', (d) => ({ ...d, segments: moveSegmentTo(d.segments, id, newStart) }));

  const handleRetime = (id: string, start: number, end: number) => {
    if (end <= start) return;
    commit('调整时间码', (d) => ({ ...d, segments: retimeSegment(d.segments, id, start, end) }));
  };

  const handleText = (id: string, text: string) =>
    commit('编辑文本', (d) => ({
      ...d,
      segments: updateSegmentText(d.segments, id, state.activeLang, text),
    }));

  const handleSpeaker = (id: string, speaker: string) =>
    commit('修改说话人', (d) => ({ ...d, segments: updateSegmentSpeaker(d.segments, id, speaker) }));

  const handleSplit = (id: string) => {
    const target = state.doc.segments.find((s) => s.id === id);
    if (!target) return;
    const mid = Math.round((target.start + target.end) / 2);
    commit('拆分片段', (d) => ({ ...d, segments: splitSegment(d.segments, id, mid) }));
  };

  const handleDelete = (id: string) =>
    commit('删除片段', (d) => ({ ...d, segments: removeSegment(d.segments, id) }));

  const handleApplyOp = (label: string, op: Operation) =>
    commit(label, (d) => ({ ...d, segments: applyOperation(d.segments, op) }));

  const handleLocate = (ids: string[]) => {
    dispatch({ type: 'select', ids });
    requestAnimationFrame(() => {
      document.getElementById(`seg-${ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      document.getElementById(`row-${ids[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  // ---- 导入 / 导出 / 重置 ----
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      let segments: Segment[];
      let languages: string[];
      if (file.name.endsWith('.srt') || text.includes('-->')) {
        segments = parseSrt(text, 'zh');
        languages = ['zh'];
      } else {
        segments = parseImportedSegments(JSON.parse(text), 'zh');
        languages = [...new Set(segments.flatMap((s) => Object.keys(s.texts)))];
        if (languages.length === 0) languages = ['zh'];
      }
      if (segments.length === 0) throw new Error('没有解析到任何片段');
      const speakers = [...new Set(segments.map((s) => s.speaker))];
      dispatch({
        type: 'replace-all',
        doc: { title: file.name, languages, speakers, segments },
        label: `导入 ${file.name}`,
        at: clock(),
      });
    } catch (err) {
      window.alert(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () =>
    download(
      'captionflow-segments.json',
      JSON.stringify(
        state.doc.segments.map((s) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          speaker: s.speaker,
          texts: s.texts,
        })),
        null,
        2,
      ),
      'application/json',
    );

  const exportSrt = () =>
    download(`captionflow-${state.activeLang}.srt`, toSrt(state.doc.segments, state.activeLang), 'text/plain');

  const resetAll = () => {
    if (!window.confirm('重置将清除本地保存、历史记录与所有版本快照，确定继续？')) return;
    dispatch({ type: 'replace-all', doc: buildSampleDoc(), label: '重置为内置示例', at: clock() });
  };

  const langLabel = (lang: string) => LANG_LABEL[lang] ?? lang;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">CF</span>
          <div>
            <h1>CaptionFlow</h1>
            <p>{state.doc.title}</p>
          </div>
        </div>

        <div className="lang-tabs" role="tablist" aria-label="语言">
          {state.doc.languages.map((lang) => (
            <button
              key={lang}
              role="tab"
              aria-selected={lang === state.activeLang}
              className={lang === state.activeLang ? 'tab active' : 'tab'}
              onClick={() => dispatch({ type: 'set-lang', lang })}
            >
              {langLabel(lang)}
            </button>
          ))}
        </div>

        <span className={issues.length > 0 ? 'issue-badge has' : 'issue-badge'}>
          {issues.length > 0 ? `⚠ ${issues.length} 个问题` : '✓ 未发现问题'}
        </span>

        <div className="header-actions">
          <button
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!canUndo(state.history)}
            title={canUndo(state.history) ? `撤销「${state.history.present.label}」` : '没有可撤销的操作'}
          >
            ↩ 撤销
          </button>
          <button
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!canRedo(state.history)}
            title={
              canRedo(state.history)
                ? `重做「${state.history.future[0]?.label ?? ''}」`
                : '没有可重做的操作'
            }
          >
            ↪ 重做
          </button>
          <span className="divider" />
          <button onClick={() => fileRef.current?.click()}>导入</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.srt,.txt"
            hidden
            onChange={handleImportFile}
          />
          <button onClick={exportJson}>导出 JSON</button>
          <button onClick={exportSrt}>导出 SRT</button>
          <span className="divider" />
          <button className="danger" onClick={resetAll}>
            重置示例
          </button>
        </div>
      </header>

      {state.restoredAt !== null && (
        <div className="notice" role="status">
          <span>
            已从本地恢复上次会话（保存于 {new Date(state.restoredAt).toLocaleString()}），共{' '}
            {state.doc.segments.length} 个片段、{state.versions.length} 个版本快照。
          </span>
          <button onClick={() => dispatch({ type: 'dismiss-restored' })}>知道了</button>
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <h2>时间轴</h2>
          <span className="muted">
            拖动片段调整位置（Shift+点击多选）· 边框标红=重叠 / 紫=说话人冲突 / 黄=翻译超时
          </span>
        </div>
        <Timeline
          segments={sortedSegments}
          speakers={state.doc.speakers}
          activeLang={state.activeLang}
          selectedIds={state.selectedIds}
          issueBySegment={issueBySegment}
          onSelect={(ids) => dispatch({ type: 'select', ids })}
          onMove={handleMove}
        />
      </section>

      <div className="grid">
        <section className="card">
          <div className="card-title">
            <h2>片段列表 · {langLabel(state.activeLang)}</h2>
            <span className="muted">直接编辑时间码（HH:MM:SS,mmm）、说话人与译文</span>
          </div>
          <SegmentTable
            segments={sortedSegments}
            speakers={state.doc.speakers}
            activeLang={state.activeLang}
            selectedIds={state.selectedIds}
            onSelect={(ids) => dispatch({ type: 'select', ids })}
            onRetime={handleRetime}
            onText={handleText}
            onSpeaker={handleSpeaker}
            onSplit={handleSplit}
            onDelete={handleDelete}
          />
        </section>

        <div className="side">
          <section className="card">
            <div className="card-title">
              <h2>问题检测</h2>
            </div>
            <IssuesPanel
              issues={issues}
              options={state.issueOptions}
              onOptionsChange={(options) => dispatch({ type: 'set-issue-options', options })}
              onLocate={handleLocate}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <h2>调整工具</h2>
              <span className="muted">应用前实时预览影响</span>
            </div>
            <ToolsPanel
              segments={sortedSegments}
              selectedIds={state.selectedIds}
              issueOptions={state.issueOptions}
              onApply={handleApplyOp}
            />
          </section>

          <section className="card">
            <div className="card-title">
              <h2>版本快照</h2>
              <span className="muted">勾选两个版本可对比差异</span>
            </div>
            <VersionsPanel
              versions={state.versions}
              onSave={(label) =>
                dispatch({
                  type: 'save-version',
                  id: `v-${clock()}-${state.versions.length}`,
                  label,
                  at: clock(),
                })
              }
              onRestore={(id) => dispatch({ type: 'restore-version', id, at: clock() })}
              onDelete={(id) => dispatch({ type: 'delete-version', id })}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
