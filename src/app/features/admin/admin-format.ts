/** Number and date formatting shared by the admin pages. */

const whole = new Intl.NumberFormat('en-US');

/** 1284 -> "1,284" */
export function count(value: number): string {
  return whole.format(value);
}

/** 3340000 -> "3.34M", 27900 -> "27.9K" */
export function compact(value: number): string {
  if (value >= 1_000_000) {
    return `${trim(value / 1_000_000)}M`;
  }
  if (value >= 10_000) {
    return `${trim(value / 1_000)}K`;
  }
  return whole.format(value);
}

/** $8.47; small amounts keep more digits so they don't show as $0.00: $0.0066 */
export function money(value: number): string {
  if (value === 0) {
    return '$0.00';
  }
  return value < 0.1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

/** 1620 -> "1.6 s", 640 -> "0.6 s", 138000 -> "2 min 18 s" */
export function duration(ms: number): string {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

/** "Today 14:02", "Yesterday 09:47", "Oct 31 22:15" */
export function when(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return `today ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `yesterday ${time}`;
  }
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

/** "Today", "Oct 30" */
export function shortDay(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? 'Today'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}
