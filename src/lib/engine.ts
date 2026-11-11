import { bytesToMbps, computeJitter, mean, median } from './format.ts';
import type { SeriesPoint } from '../types.ts';

export interface PingResult {
  samples: number[];
  avgMs: number;
  minMs: number;
  jitterMs: number;
  lossPct: number;
  attempts: number;
}

export interface ThroughputResult {
  mbps: number;
  peakMbps: number;
  bytes: number;
  series: SeriesPoint[];
}

const API = '/api';

// Pre-built 2 MB incompressible random payload (built in 64 KB WebCrypto-safe slices)
let cachedUploadPool: Uint8Array | null = null;
function getUploadPayload(byteLength: number): Uint8Array {
  const POOL_SIZE = 2 * 1024 * 1024; // 2 MB
  if (!cachedUploadPool) {
    cachedUploadPool = new Uint8Array(POOL_SIZE);
    for (let offset = 0; offset < POOL_SIZE; offset += 65536) {
      const len = Math.min(65536, POOL_SIZE - offset);
      crypto.getRandomValues(cachedUploadPool.subarray(offset, offset + len));
    }
  }
  if (byteLength <= cachedUploadPool.byteLength) {
    return cachedUploadPool.subarray(0, byteLength);
  }
  return cachedUploadPool;
}

async function fetchPingOnce(seq: number, signal?: AbortSignal): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${API}/speedtest/ping?seq=${seq}&_=${Date.now()}-${Math.random()}`, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error(`ping ${res.status}`);
  await res.text();
  return performance.now() - start;
}

/** Sequential ping probes with packet-loss + RFC-3550 jitter stats. */
export async function measurePing(
  count = 12,
  signal?: AbortSignal,
  onSample?: (ms: number | null, index: number, total: number) => void,
): Promise<PingResult> {
  // Warm up connection / TLS session before recording latency
  try {
    await fetchPingOnce(-1, signal);
  } catch {
    /* ignore warmup error */
  }

  const samples: number[] = [];
  let failures = 0;
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    try {
      const ms = await fetchPingOnce(i, signal);
      samples.push(ms);
      onSample?.(ms, i + 1, count);
    } catch {
      if (signal?.aborted) break;
      failures++;
      onSample?.(null, i + 1, count);
    }
    await new Promise((r) => setTimeout(r, 45));
  }
  const attempts = samples.length + failures;
  return {
    samples,
    avgMs: mean(samples),
    minMs: samples.length ? Math.min(...samples) : 0,
    jitterMs: computeJitter(samples),
    lossPct: attempts ? (failures / attempts) * 100 : 100,
    attempts,
  };
}

/** Single lightweight ping probe (used for live monitor & loaded-latency bufferbloat checks). */
export async function pingOnce(signal?: AbortSignal): Promise<number | null> {
  try {
    return await fetchPingOnce(Math.floor(Math.random() * 1e9), signal);
  } catch {
    return null;
  }
}

interface StreamCounters {
  bytes: number;
  controller: AbortController;
}

/** One download worker: continuously streams binary chunks until test duration ends. */
async function downloadStream(
  counters: StreamCounters,
  signal: AbortSignal,
  streamIndex: number,
  throttleMbps = 0,
): Promise<void> {
  let reqSeq = 0;
  while (!signal.aborted && !counters.controller.signal.aborted) {
    const chunkBytes = reqSeq === 0 ? 8 * 1024 * 1024 : 24 * 1024 * 1024;
    reqSeq++;
    const qs = new URLSearchParams({
      bytes: String(chunkBytes),
      stream: String(streamIndex),
      seq: String(reqSeq),
      _: `${Date.now()}-${Math.random()}`,
    });
    if (throttleMbps > 0) {
      qs.set('throttleMbps', String(throttleMbps));
    }
    const res = await fetch(`${API}/speedtest/download?${qs.toString()}`, {
      cache: 'no-store',
      signal: counters.controller.signal,
    });
    if (!res.ok || !res.body) break;
    const reader = res.body.getReader();
    try {
      for (;;) {
        if (signal.aborted || counters.controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value) counters.bytes += value.byteLength;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* noop */
      }
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
  }
}

export async function measureDownload(
  streams: number,
  durationSec: number,
  signal: AbortSignal,
  onTick?: (mbps: number, bytes: number, progress: number) => void,
  onLoadedPing?: (ms: number | null) => void,
  throttleMbps = 0,
): Promise<ThroughputResult> {
  const counters: StreamCounters[] = Array.from({ length: streams }, () => ({
    bytes: 0,
    controller: new AbortController(),
  }));
  const start = performance.now();
  const series: SeriesPoint[] = [];
  const snapshots: { t: number; bytes: number }[] = [{ t: 0, bytes: 0 }];
  let peak = 0;

  const perStreamThrottle = throttleMbps > 0 ? throttleMbps / streams : 0;

  const sampler = setInterval(() => {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed <= 0) return;
    const total = counters.reduce((a, c) => a + c.bytes, 0);
    snapshots.push({ t: elapsed, bytes: total });
    while (snapshots.length > 2 && elapsed - snapshots[0].t > 0.9) {
      snapshots.shift();
    }
    const windowDt = elapsed - snapshots[0].t;
    const windowBytes = total - snapshots[0].bytes;
    const instantMbps =
      windowDt > 0.08 ? bytesToMbps(windowBytes, windowDt) : bytesToMbps(total, elapsed);

    peak = Math.max(peak, instantMbps);
    series.push({ t: Number(elapsed.toFixed(2)), mbps: Number(instantMbps.toFixed(2)) });
    onTick?.(instantMbps, total, Math.min(1, elapsed / durationSec));
  }, 120);

  const pingTimer = onLoadedPing
    ? setInterval(() => {
        void pingOnce(signal).then(onLoadedPing);
      }, 450)
    : null;

  const workers = counters.map((c, idx) =>
    downloadStream(c, signal, idx, perStreamThrottle).catch(() => undefined),
  );

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, durationSec * 1000);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

  counters.forEach((c) => c.controller.abort());
  clearInterval(sampler);
  if (pingTimer) clearInterval(pingTimer);
  await Promise.allSettled(workers);

  const elapsed = Math.max(0.1, (performance.now() - start) / 1000);
  const totalBytes = counters.reduce((a, c) => a + c.bytes, 0);
  const overallMbps = bytesToMbps(totalBytes, elapsed);
  // Sustained speed uses post-warmup samples when available for realistic ISP speed reporting
  const steadySamples = series.slice(Math.min(3, Math.floor(series.length * 0.2))).map((s) => s.mbps);
  const sustainedMbps = steadySamples.length >= 3 ? mean(steadySamples) : overallMbps;

  return {
    mbps: sustainedMbps,
    peakMbps: Math.max(peak, sustainedMbps),
    bytes: totalBytes,
    series,
  };
}

/** Single XHR upload burst with real socket-level upload progress reporting. */
function sendUploadBurst(
  payload: Uint8Array,
  abortSignal: AbortSignal,
  onDeltaBytes: (delta: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal.aborted) {
      resolve();
      return;
    }
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      abortSignal.removeEventListener('abort', handleAbort);
      resolve();
    };

    const handleAbort = () => {
      try {
        xhr.abort();
      } catch {
        /* noop */
      }
      finish();
    };

    abortSignal.addEventListener('abort', handleAbort, { once: true });

    xhr.open('POST', `${API}/speedtest/upload?_=${Date.now()}-${Math.random()}`, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (ev) => {
      if (ev.loaded > lastLoaded) {
        onDeltaBytes(ev.loaded - lastLoaded);
        lastLoaded = ev.loaded;
      }
    };

    xhr.onload = () => {
      if (payload.byteLength > lastLoaded) {
        onDeltaBytes(payload.byteLength - lastLoaded);
        lastLoaded = payload.byteLength;
      }
      finish();
    };
    xhr.onerror = finish;
    xhr.onabort = finish;

    try {
      // Pass a Blob view over the random buffer for universal XHR compatibility
      xhr.send(new Blob([payload as BlobPart]));
    } catch {
      finish();
    }
  });
}

async function uploadStream(counters: StreamCounters, signal: AbortSignal): Promise<void> {
  let burstSize = 512 * 1024; // Start at 512 KB, ramp up to 2 MB for high-speed links
  while (!signal.aborted && !counters.controller.signal.aborted) {
    const t0 = performance.now();
    const payload = getUploadPayload(burstSize);
    await sendUploadBurst(payload, counters.controller.signal, (delta) => {
      counters.bytes += delta;
    });
    const dt = performance.now() - t0;
    if (dt < 250 && burstSize < 2 * 1024 * 1024) {
      burstSize = Math.min(2 * 1024 * 1024, burstSize * 2);
    }
  }
}

export async function measureUpload(
  streams: number,
  durationSec: number,
  signal: AbortSignal,
  onTick?: (mbps: number, bytes: number, progress: number) => void,
  onLoadedPing?: (ms: number | null) => void,
): Promise<ThroughputResult> {
  const counters: StreamCounters[] = Array.from({ length: streams }, () => ({
    bytes: 0,
    controller: new AbortController(),
  }));
  const start = performance.now();
  const series: SeriesPoint[] = [];
  const snapshots: { t: number; bytes: number }[] = [{ t: 0, bytes: 0 }];
  let peak = 0;

  const sampler = setInterval(() => {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed <= 0) return;
    const total = counters.reduce((a, c) => a + c.bytes, 0);
    snapshots.push({ t: elapsed, bytes: total });
    while (snapshots.length > 2 && elapsed - snapshots[0].t > 0.9) {
      snapshots.shift();
    }
    const windowDt = elapsed - snapshots[0].t;
    const windowBytes = total - snapshots[0].bytes;
    const instantMbps =
      windowDt > 0.08 ? bytesToMbps(windowBytes, windowDt) : bytesToMbps(total, elapsed);

    peak = Math.max(peak, instantMbps);
    series.push({ t: Number(elapsed.toFixed(2)), mbps: Number(instantMbps.toFixed(2)) });
    onTick?.(instantMbps, total, Math.min(1, elapsed / durationSec));
  }, 120);

  const pingTimer = onLoadedPing
    ? setInterval(() => {
        void pingOnce(signal).then(onLoadedPing);
      }, 450)
    : null;

  const workers = counters.map((c) => uploadStream(c, signal).catch(() => undefined));

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, durationSec * 1000);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

  counters.forEach((c) => c.controller.abort());
  clearInterval(sampler);
  if (pingTimer) clearInterval(pingTimer);
  await Promise.allSettled(workers);

  const elapsed = Math.max(0.1, (performance.now() - start) / 1000);
  const totalBytes = counters.reduce((a, c) => a + c.bytes, 0);
  const overallMbps = bytesToMbps(totalBytes, elapsed);
  const steadySamples = series.slice(Math.min(3, Math.floor(series.length * 0.2))).map((s) => s.mbps);
  const sustainedMbps = steadySamples.length >= 3 ? mean(steadySamples) : overallMbps;

  return {
    mbps: sustainedMbps,
    peakMbps: Math.max(peak, sustainedMbps),
    bytes: totalBytes,
    series,
  };
}

/** Quick lightweight burst probe for the continuous Live Bandwidth Monitor mode. */
export async function probeLiveBandwidth(signal?: AbortSignal): Promise<{
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number | null;
  bytesUsed: number;
}> {
  const pingMs = await pingOnce(signal);
  if (signal?.aborted) {
    return { downloadMbps: 0, uploadMbps: 0, pingMs, bytesUsed: 0 };
  }

  // 512 KB quick download probe
  const dlBytesTarget = 512 * 1024;
  const dlStart = performance.now();
  let dlBytes = 0;
  try {
    const res = await fetch(
      `${API}/speedtest/download?bytes=${dlBytesTarget}&_=${Date.now()}-${Math.random()}`,
      { cache: 'no-store', signal },
    );
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) dlBytes += value.byteLength;
      }
      reader.releaseLock();
    }
  } catch {
    /* ignore */
  }
  const dlSec = Math.max(0.005, (performance.now() - dlStart) / 1000);
  const downloadMbps = bytesToMbps(dlBytes, dlSec);

  if (signal?.aborted) {
    return { downloadMbps, uploadMbps: 0, pingMs, bytesUsed: dlBytes };
  }

  // 256 KB quick upload probe
  const ulPayload = getUploadPayload(256 * 1024);
  const ulCtrl = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => ulCtrl.abort(), { once: true });
  }
  let ulBytes = 0;
  const ulStart = performance.now();
  await sendUploadBurst(ulPayload, ulCtrl.signal, (d) => {
    ulBytes += d;
  });
  const ulSec = Math.max(0.005, (performance.now() - ulStart) / 1000);
  const uploadMbps = bytesToMbps(ulBytes, ulSec);

  return {
    downloadMbps,
    uploadMbps,
    pingMs,
    bytesUsed: dlBytes + ulBytes,
  };
}

/** Consistency = how stable the throughput was (100 = perfectly flat). */
export function consistency(series: SeriesPoint[]): number {
  if (series.length < 3) return 100;
  const values = series.map((p) => p.mbps);
  const avg = mean(values);
  if (avg <= 0) return 0;
  const med = median(values);
  const score = 100 - Math.min(100, (Math.abs(avg - med) / avg) * 100);
  return Math.max(0, Math.min(100, score));
}
