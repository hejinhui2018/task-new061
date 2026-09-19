/** 一条历史记录：状态快照 + 产生它的操作名 + 时间（来自注入时钟） */
export interface HistoryEntry<T> {
  state: T;
  label: string;
  at: number;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: HistoryEntry<T>;
  future: HistoryEntry<T>[];
}

export function initHistory<T>(entry: HistoryEntry<T>): History<T> {
  return { past: [], present: entry, future: [] };
}

/** 提交新状态：present 入栈，future 清空；past 最多保留 limit 条 */
export function pushHistory<T>(h: History<T>, entry: HistoryEntry<T>, limit = 100): History<T> {
  const past = [...h.past, h.present];
  return {
    past: past.slice(Math.max(0, past.length - limit)),
    present: entry,
    future: [],
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return {
    past: [...h.past, h.present],
    present: next,
    future: rest,
  };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
