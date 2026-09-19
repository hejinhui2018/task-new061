import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  commit,
  createHistory,
  redo as historyRedo,
  restoreHistory,
  restoreVersion,
  serializeHistory,
  undo as historyUndo,
  type HistoryState,
} from '../domain/history';
import { analyze } from '../domain/analyze';
import {
  batchShift as opBatchShift,
  changeSpeaker as opChangeSpeaker,
  createIdFactory,
  insertDelay as opInsertDelay,
  moveCue as opMoveCue,
  repairOverlap as opRepair,
  splitCue as opSplit,
  trimCue as opTrimCue,
  type ImpactedCue,
  type MoveOptions,
  type OverlapRepairMode,
} from '../domain/ops';
import { importTranscript, parseSrt } from '../domain/codec';
import { createSampleTranscript } from '../domain/sample';
import type { Cue, Issue, LanguageCode, Transcript } from '../domain/types';

const STORAGE_KEY = 'captionflow:history:v1';
const MAX_HISTORY = 100;

const newSplitId = createIdFactory('cue-new-');

export interface OperationReport {
  label: string;
  summary: string;
  createdAt: number;
  impacted: ImpactedCue[];
  issuesBefore: Issue[];
  issuesAfter: Issue[];
}

interface AppState {
  history: HistoryState;
  language: LanguageCode;
  selectedCueId: string | null;
  lastOp: OperationReport | null;
  /** 瞬时提示（导入失败等） */
  notice: { kind: 'error' | 'info'; text: string } | null;
}

type Action =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'restoreVersion'; versionId: string }
  | { type: 'selectLanguage'; language: LanguageCode }
  | { type: 'selectCue'; cueId: string | null }
  | { type: 'move'; cueId: string; startMs: number; options?: MoveOptions; label?: string }
  | { type: 'trim'; cueId: string; edge: 'start' | 'end'; valueMs: number }
  | { type: 'split'; cueId: string; atMs: number }
  | { type: 'insertDelay'; atMs: number; durationMs: number }
  | { type: 'batchShift'; cueIds?: string[]; fromId?: string; deltaMs: number }
  | { type: 'repair'; cueId?: string; mode: OverlapRepairMode }
  | { type: 'changeSpeaker'; cueId: string; speakerId: string }
  | { type: 'editText'; cueId: string; language: string; text: string }
  | { type: 'loadTranscript'; transcript: Transcript; label: string }
  | { type: 'resetSample' }
  | { type: 'notice'; notice: AppState['notice'] };

function currentTranscript(history: HistoryState): Transcript {
  // 历史中的快照数据已冻结语义；reducer 内所有领域函数都自行克隆
  return history.present.transcript;
}

/** 在 reducer 中应用一次产生新版本的编辑 */
function applyEdit(
  state: AppState,
  label: string,
  next: Transcript,
  impacted: ImpactedCue[],
  summary: string,
): AppState {
  const issuesBefore = analyze(currentTranscript(state.history));
  const history = commit(state.history, next, label, Date.now, MAX_HISTORY);
  const issuesAfter = analyze(history.present.transcript);
  return {
    ...state,
    history,
    lastOp: { label, summary, impacted, createdAt: history.present.createdAt, issuesBefore, issuesAfter },
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'undo': {
      if (state.history.past.length === 0) return state;
      return { ...state, history: historyUndo(state.history), selectedCueId: state.selectedCueId };
    }
    case 'redo': {
      if (state.history.future.length === 0) return state;
      return { ...state, history: historyRedo(state.history) };
    }
    case 'restoreVersion': {
      const history = restoreVersion(state.history, action.versionId, Date.now, MAX_HISTORY);
      return { ...state, history, selectedCueId: null };
    }
    case 'selectLanguage':
      return { ...state, language: action.language };
    case 'selectCue':
      return { ...state, selectedCueId: action.cueId };
    case 'move': {
      const t = currentTranscript(state.history);
      const result = opMoveCue(t.cues, action.cueId, action.startMs, action.options);
      return applyEdit(state, action.label ?? '拖动片段', { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'trim': {
      const t = currentTranscript(state.history);
      const result = opTrimCue(t.cues, action.cueId, action.edge, action.valueMs);
      return applyEdit(state, '调整边缘', { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'split': {
      const t = currentTranscript(state.history);
      const result = opSplit(t.cues, action.cueId, action.atMs, newSplitId);
      return applyEdit(state, '拆分片段', { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'insertDelay': {
      const t = currentTranscript(state.history);
      const result = opInsertDelay(t.cues, action.atMs, action.durationMs);
      return applyEdit(state, `插入延迟 ${action.durationMs}ms`, { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'batchShift': {
      const t = currentTranscript(state.history);
      const result = opBatchShift(t.cues, { ids: action.cueIds, fromId: action.fromId, deltaMs: action.deltaMs });
      return applyEdit(state, result.summary, { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'repair': {
      const t = currentTranscript(state.history);
      const result = opRepair(t.cues, action.cueId, action.mode);
      if (result.impacted.length === 0) {
        return { ...state, notice: { kind: 'info', text: '没有检测到需要修复的重叠' } };
      }
      return applyEdit(state, '修复重叠', { ...t, cues: result.cues }, result.impacted, result.summary);
    }
    case 'changeSpeaker': {
      const t = currentTranscript(state.history);
      const result = opChangeSpeaker(t.cues, action.cueId, action.speakerId);
      return applyEdit(
        state,
        '更换发言人',
        { ...t, cues: result.cues },
        [],
        `片段 ${action.cueId} 发言人改为 ${action.speakerId}`,
      );
    }
    case 'editText': {
      const t = currentTranscript(state.history);
      const cues = t.cues.map((c) =>
        c.id === action.cueId ? { ...c, text: { ...c.text, [action.language]: action.text } } : c,
      );
      return applyEdit(state, `编辑 ${action.language.toUpperCase()} 文本`, { ...t, cues }, [], `编辑片段 ${action.cueId}`);
    }
    case 'loadTranscript': {
      const history = commit(
        state.history,
        action.transcript,
        action.label,
        Date.now,
        MAX_HISTORY,
      );
      return { ...state, history, selectedCueId: null, lastOp: null, notice: { kind: 'info', text: action.label } };
    }
    case 'resetSample': {
      return {
        ...state,
        history: createHistory(createSampleTranscript(), { label: '内置示例', now: Date.now() }),
        selectedCueId: null,
        lastOp: null,
        notice: { kind: 'info', text: '已重置为内置双人采访示例' },
      };
    }
    case 'notice':
      return { ...state, notice: action.notice };
    default:
      return state;
  }
}

function initState(): AppState {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const restored = restoreHistory(raw);
      if (restored) {
        return {
          history: restored,
          language: 'zh',
          selectedCueId: null,
          lastOp: null,
          notice: { kind: 'info', text: '已从上次会话恢复' },
        };
      }
    }
  }
  return {
    history: createHistory(createSampleTranscript(), { label: '内置示例' }),
    language: 'zh',
    selectedCueId: null,
    lastOp: null,
    notice: null,
  };
}

interface Store {
  state: AppState;
  transcript: Transcript;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  importFile: (file: File) => Promise<void>;
}

const CaptionStoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  // 刷新恢复：每次历史变化写入 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeHistory(state.history));
    } catch {
      // 存储已满或被禁用时静默降级，编辑仍可在当前会话使用
    }
  }, [state.history]);

  const transcript = state.history.present.transcript;
  const issues = useMemo(() => analyze(transcript), [transcript]);

  const importFile = useCallback(async (file: File) => {
    try {
      const content = await file.text();
      const data = file.name.toLowerCase().endsWith('.srt')
        ? parseSrt(content)
        : importTranscript(JSON.parse(content));
      dispatch({ type: 'loadTranscript', transcript: data, label: `导入 ${file.name}` });
    } catch (err) {
      dispatch({ type: 'notice', notice: { kind: 'error', text: `导入失败：${(err as Error).message}` } });
    }
  }, []);

  const value = useMemo<Store>(
    () => ({
      state,
      transcript,
      issues,
      dispatch,
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      canUndo: state.history.past.length > 0,
      canRedo: state.history.future.length > 0,
      importFile,
    }),
    [state, transcript, issues, importFile],
  );

  return <CaptionStoreContext.Provider value={value}>{children}</CaptionStoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(CaptionStoreContext);
  if (!store) throw new Error('useStore 必须在 StoreProvider 内使用');
  return store;
}

export function cueById(transcript: Transcript, id: string | null): Cue | undefined {
  return id ? transcript.cues.find((c) => c.id === id) : undefined;
}
