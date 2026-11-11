import express, { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const router = Router();

// Pre-allocate a 64KB high-entropy random buffer once at startup.
// Using random bytes prevents transparent proxy/gzip compression from skewing bandwidth measurements.
const CHUNK_SIZE = 65536; // 64 KB
const RANDOM_BUFFER = crypto.randomBytes(CHUNK_SIZE);

export interface SpeedTestRecord {
  id: string;
  timestamp: string;
  serverName: string;
  serverLocation: string;
  streams: number;
  durationSec: number;
  downloadMbps: number;
  downloadPeakMbps: number;
  downloadBytes: number;
  uploadMbps: number;
  uploadPeakMbps: number;
  uploadBytes: number;
  pingMs: number;
  jitterMs: number;
  downloadLoadedPingMs: number;
  uploadLoadedPingMs: number;
  packetLossPct: number;
  bufferbloatGrade: string;
  consistencyPct: number;
  clientIp: string;
  connectionType: string;
  downloadSeries: { t: number; mbps: number }[];
  uploadSeries: { t: number; mbps: number }[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'speedtest-history.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory(): SpeedTestRecord[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(records: SpeedTestRecord[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(records.slice(0, 100), null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write history file:', err);
  }
}

function setNoCacheHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, no-transform');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Timing-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Server-Time-Ms, X-Bytes-Received, X-Duration-Ms');
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.length > 0) {
    return cfIp.trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }
  const raw = req.socket.remoteAddress || '127.0.0.1';
  return raw.replace(/^::ffff:/, '');
}

/**
 * GET /api/speedtest/ping
 * High-precision latency and jitter probe endpoint.
 */
router.get('/speedtest/ping', async (req: Request, res: Response) => {
  const start = performance.now();
  setNoCacheHeaders(res);

  const artificialDelayMs = Math.min(
    500,
    Math.max(0, Number(req.query.delayMs) || 0)
  );
  if (artificialDelayMs > 0) {
    await new Promise((r) => setTimeout(r, artificialDelayMs));
  }

  const serverProcessingMs = Number((performance.now() - start).toFixed(3));
  res.setHeader('X-Server-Time-Ms', String(serverProcessingMs));
  res.json({
    ok: true,
    seq: Number(req.query.seq) || 0,
    serverProcessingMs,
    timestamp: Date.now(),
  });
});

/**
 * GET /api/speedtest/download
 * Streams incompressible binary buffers to measure client download throughput.
 * Query params:
 *   - bytes: total bytes to stream (default 8MB, max 64MB)
 *   - throttleMbps: optional rate cap in Mbps (0 = unthrottled)
 */
router.get('/speedtest/download', (req: Request, res: Response) => {
  setNoCacheHeaders(res);

  const requestedBytes = Number(req.query.bytes) || 8 * 1024 * 1024;
  const totalBytes = Math.min(64 * 1024 * 1024, Math.max(16384, requestedBytes));
  const throttleMbps = Math.max(0, Number(req.query.throttleMbps) || 0);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Length', String(totalBytes));
  res.setHeader('X-Content-Type-Options', 'nosniff');

  let bytesSent = 0;
  let aborted = false;
  const startTime = performance.now();

  req.on('close', () => {
    aborted = true;
  });

  function sendChunks() {
    if (aborted || res.writableEnded) return;

    while (bytesSent < totalBytes && !aborted) {
      // Optional rate shaping if a throttle profile is active
      if (throttleMbps > 0) {
        const elapsedSec = Math.max(0.001, (performance.now() - startTime) / 1000);
        const allowedBytes = (throttleMbps * 1_000_000 / 8) * elapsedSec;
        if (bytesSent > allowedBytes) {
          setTimeout(sendChunks, 8);
          return;
        }
      }

      const remaining = totalBytes - bytesSent;
      const chunk =
        remaining >= CHUNK_SIZE
          ? RANDOM_BUFFER
          : RANDOM_BUFFER.subarray(0, remaining);

      bytesSent += chunk.length;
      const canContinue = res.write(chunk);

      if (bytesSent >= totalBytes) {
        res.end();
        return;
      }

      if (!canContinue) {
        res.once('drain', sendChunks);
        return;
      }

      // Yield periodically every 512KB so concurrent ping requests are serviced with sub-millisecond latency
      if ((bytesSent & 0x7ffff) === 0) {
        setImmediate(sendChunks);
        return;
      }
    }
  }

  sendChunks();
});

/**
 * POST /api/speedtest/upload
 * Consumes binary upload streams without buffering in memory to measure upload throughput.
 */
router.post('/speedtest/upload', (req: Request, res: Response) => {
  setNoCacheHeaders(res);
  const startTime = performance.now();
  let bytesReceived = 0;

  req.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.length;
  });

  req.on('end', () => {
    const durationMs = Math.max(0.1, performance.now() - startTime);
    const serverMbps = Number(((bytesReceived * 8) / (durationMs * 1000)).toFixed(2));
    res.setHeader('X-Bytes-Received', String(bytesReceived));
    res.setHeader('X-Duration-Ms', durationMs.toFixed(2));
    res.json({
      ok: true,
      bytesReceived,
      durationMs: Number(durationMs.toFixed(2)),
      serverMbps,
      timestamp: Date.now(),
    });
  });

  req.on('error', () => {
    if (!res.headersSent) {
      res.status(400).json({ ok: false, error: 'Upload stream interrupted' });
    }
  });
});

/**
 * GET /api/network-info
 * Returns telemetry on the client's connection, IP, protocol, headers, and available test nodes.
 */
router.get('/network-info', (req: Request, res: Response) => {
  setNoCacheHeaders(res);
  const clientIp = getClientIp(req);
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';
  const userAgent = req.headers['user-agent'] || 'Unknown Client';
  const language = (req.headers['accept-language'] || 'en-US').split(',')[0];
  const country = (req.headers['cf-ipcountry'] as string) || 'Global Edge';

  res.json({
    ok: true,
    clientIp,
    protocol: proto.toUpperCase(),
    httpVersion: `HTTP/${req.httpVersion}`,
    host,
    userAgent,
    language,
    country,
    tlsActive: proto === 'https',
    serverNode: {
      id: 'pulse-cloud-01',
      name: 'PULSE Cloud Core #01',
      location: 'Cloud Edge Gateway',
      hostname: os.hostname(),
      platform: `${os.type()} ${os.arch()}`,
      cpus: os.cpus().length,
      uptimeSec: Math.floor(process.uptime()),
    },
    servers: [
      {
        id: 'pulse-cloud-01',
        name: 'PULSE Cloud Core #01',
        location: 'Primary Edge Gateway',
        provider: 'Direct Full-Duplex Node',
        recommendedStreams: 4,
      },
      {
        id: 'pulse-multi-02',
        name: 'PULSE High-Flux #02',
        location: 'Multi-Stream Backbone',
        provider: '8x Parallel Saturation',
        recommendedStreams: 8,
      },
      {
        id: 'pulse-gaming-03',
        name: 'PULSE Low-Latency #03',
        location: 'VoIP & Gaming Telemetry',
        provider: 'Precision Bufferbloat Probe',
        recommendedStreams: 2,
      },
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/history
 * Returns saved speed test history records.
 */
router.get('/history', (_req: Request, res: Response) => {
  setNoCacheHeaders(res);
  const records = readHistory();
  res.json({ ok: true, records });
});

/**
 * POST /api/history
 * Saves a completed speed test record.
 */
router.post('/history', express.json({ limit: '2mb' }), (req: Request, res: Response) => {
  setNoCacheHeaders(res);
  const body = req.body as Partial<SpeedTestRecord>;
  if (!body || typeof body.downloadMbps !== 'number') {
    res.status(400).json({ ok: false, error: 'Invalid speed test record payload' });
    return;
  }

  const record: SpeedTestRecord = {
    id: body.id || crypto.randomUUID(),
    timestamp: body.timestamp || new Date().toISOString(),
    serverName: body.serverName || 'PULSE Cloud Core #01',
    serverLocation: body.serverLocation || 'Primary Edge Gateway',
    streams: Number(body.streams) || 4,
    durationSec: Number(body.durationSec) || 10,
    downloadMbps: Number(body.downloadMbps) || 0,
    downloadPeakMbps: Number(body.downloadPeakMbps) || 0,
    downloadBytes: Number(body.downloadBytes) || 0,
    uploadMbps: Number(body.uploadMbps) || 0,
    uploadPeakMbps: Number(body.uploadPeakMbps) || 0,
    uploadBytes: Number(body.uploadBytes) || 0,
    pingMs: Number(body.pingMs) || 0,
    jitterMs: Number(body.jitterMs) || 0,
    downloadLoadedPingMs: Number(body.downloadLoadedPingMs) || 0,
    uploadLoadedPingMs: Number(body.uploadLoadedPingMs) || 0,
    packetLossPct: Number(body.packetLossPct) || 0,
    bufferbloatGrade: body.bufferbloatGrade || 'A',
    consistencyPct: Number(body.consistencyPct) || 95,
    clientIp: body.clientIp || getClientIp(req),
    connectionType: body.connectionType || 'Broadband',
    downloadSeries: Array.isArray(body.downloadSeries) ? body.downloadSeries.slice(0, 120) : [],
    uploadSeries: Array.isArray(body.uploadSeries) ? body.uploadSeries.slice(0, 120) : [],
  };

  const existing = readHistory().filter((r) => r.id !== record.id);
  const updated = [record, ...existing].slice(0, 100);
  writeHistory(updated);
  res.json({ ok: true, record, total: updated.length });
});

/**
 * DELETE /api/history/:id
 * Deletes a single speed test record.
 */
router.delete('/history/:id', (req: Request, res: Response) => {
  setNoCacheHeaders(res);
  const { id } = req.params;
  const existing = readHistory();
  const updated = existing.filter((r) => r.id !== id);
  writeHistory(updated);
  res.json({ ok: true, total: updated.length });
});

/**
 * DELETE /api/history
 * Clears all saved speed test records.
 */
router.delete('/history', (_req: Request, res: Response) => {
  setNoCacheHeaders(res);
  writeHistory([]);
  res.json({ ok: true, total: 0 });
});

export default router;
