const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** 毫秒 → "HH:MM:SS,mmm"（支持负数，前缀 -） */
export function msToTimecode(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(Math.round(ms));
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const milli = abs % 1000;
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/**
 * 解析时间码 → 毫秒；非法输入返回 null。
 * 支持："HH:MM:SS,mmm"、"MM:SS.mmm"、"SS,mmm"、裸秒数（如 "75"）。
 * 分、秒均不允许超过 59。
 */
export function timecodeToMs(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const parts = body.split(':');
  if (parts.length > 3) return null;

  const secMatch = /^(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(parts[parts.length - 1]);
  if (!secMatch) return null;

  const heads: number[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!/^\d{1,2}$/.test(parts[i])) return null;
    heads.push(parseInt(parts[i], 10));
  }

  const sec = parseInt(secMatch[1], 10);
  const frac = secMatch[2] ? parseInt(secMatch[2].padEnd(3, '0'), 10) : 0;
  let hours = 0;
  let minutes = 0;
  if (parts.length === 3) {
    [hours, minutes] = heads;
  } else if (parts.length === 2) {
    minutes = heads[0];
  }
  if (minutes > 59 || sec > 59) return null;

  const total = hours * 3_600_000 + minutes * 60_000 + sec * 1000 + frac;
  return negative ? -total : total;
}

/** 毫秒 → 人类可读时长，如 "1.5s"、"2m 03s" */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1)}s`;
  const m = Math.floor(abs / 60_000);
  const s = Math.round((abs % 60_000) / 1000);
  return `${sign}${m}m ${pad(s)}s`;
}
