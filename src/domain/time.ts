/**
 * 时间码纯函数：所有函数都不依赖时钟或全局状态，可直接单测。
 * 支持 SRT 风格 `HH:MM:SS,mmm` 与 VTT 风格 `HH:MM:SS.mmm`，可省略小时。
 */

const TC_FULL = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/;
const TC_SHORT = /^(\d{1,2}):(\d{2})[,.](\d{1,3})$/;

export function parseTimecode(input: string): number {
  const value = input.trim();
  const full = TC_FULL.exec(value);
  if (full) {
    const [, h, m, s, ms] = full;
    return (
      Number(h) * 3_600_000 +
      Number(m) * 60_000 +
      Number(s) * 1_000 +
      normalizeMs(ms)
    );
  }
  const short = TC_SHORT.exec(value);
  if (short) {
    const [, m, s, ms] = short;
    return Number(m) * 60_000 + Number(s) * 1_000 + normalizeMs(ms);
  }
  throw new Error(`无法解析时间码: "${input}"`);
}

function normalizeMs(ms: string): number {
  return Number(ms.padEnd(3, '0'));
}

export function formatTimecode(ms: number, separator: ',' | '.' = ','): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`时间码必须为非负有限数值，收到: ${ms}`);
  }
  const total = Math.round(ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = total % 1_000;
  return (
    `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${separator}` +
    String(millis).padStart(3, '0')
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 紧凑显示，用于差异/提示（如 +1.50s / −400ms） */
export function formatDelta(ms: number): string {
  const sign = ms > 0 ? '+' : ms < 0 ? '−' : '';
  const abs = Math.abs(ms);
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(2)}s`;
  }
  return `${sign}${abs}ms`;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(2)}s`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 按吸附步长取整（默认 10ms，时间轴拖动时使用） */
export function snap(value: number, step = 10): number {
  return Math.round(value / step) * step;
}

/** 两个区间的交叠毫秒数，不相交时为 0（相邻边界不算重叠） */
export function overlapAmount(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * 解析用户输入的时长：支持 "1500" / "1500ms" / "1.5s" / "-0.5s"。
 * 非法输入返回 null，由 UI 提示。
 */
export function parseDurationInput(input: string): number | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(s|ms)?\s*$/i.exec(input);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? 'ms').toLowerCase();
  return Math.round(unit === 's' ? value * 1000 : value);
}
