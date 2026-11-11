/** Pure helpers — unit-tested in tests/format.test.ts */

export function bytesToMbps(bytes: number, seconds: number): number {
  if (seconds <= 0 || bytes < 0) return 0;
  return (bytes * 8) / (seconds * 1_000_000);
}

export function mbpsToDisplay(mbps: number, unit: 'Mbps' | 'MB/s'): number {
  return unit === 'MB/s' ? mbps / 8 : mbps;
}

export function formatSpeed(mbps: number, unit: 'Mbps' | 'MB/s' = 'Mbps'): string {
  const v = mbpsToDisplay(mbps, unit);
  if (!isFinite(v) || v < 0) return '0.00';
  if (v >= 1000) return v.toFixed(1);
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(2);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

export function formatPing(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return '—';
  return `${ms.toFixed(1)} ms`;
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Mean absolute difference between consecutive samples (RFC 3550-style jitter). */
export function computeJitter(samples: number[]): number {
  if (samples.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < samples.length; i++) {
    sum += Math.abs(samples[i] - samples[i - 1]);
  }
  return sum / (samples.length - 1);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Bufferbloat grade from loaded-vs-idle latency delta. A (best) → F. */
export function bufferbloatGrade(idleMs: number, loadedMs: number): string {
  const delta = loadedMs - idleMs;
  if (delta < 5) return 'A';
  if (delta < 15) return 'B';
  if (delta < 30) return 'C';
  if (delta < 60) return 'D';
  return 'F';
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#10B981';
    case 'B': return '#84CC16';
    case 'C': return '#F59E0B';
    case 'D': return '#F97316';
    default: return '#EF4444';
  }
}

export function qualityLabel(mbps: number): string {
  if (mbps >= 100) return 'Excellent — 4K streaming, competitive gaming, large downloads';
  if (mbps >= 50) return 'Great — HD/4K streaming, video calls, fast downloads';
  if (mbps >= 25) return 'Good — HD streaming, smooth video calls';
  if (mbps >= 10) return 'Fair — SD/HD streaming, basic browsing';
  if (mbps > 0) return 'Slow — browsing and messaging only';
  return 'No connection detected';
}

/** Pick a sensible gauge max so the needle uses the dial. */
export function gaugeMax(mbps: number): number {
  if (mbps <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(mbps)));
  const norm = mbps / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
