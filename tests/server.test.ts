import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../server/index.ts';

describe('speedtest backend API endpoints', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = await createApp(true);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('responds to /api/speedtest/ping with no-store headers and sequence id', async () => {
    const res = await fetch(`${baseUrl}/api/speedtest/ping?seq=7`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.seq).toBe(7);
    expect(typeof json.serverProcessingMs).toBe('number');
  });

  it('streams exact requested binary bytes on /api/speedtest/download', async () => {
    const targetBytes = 262144; // 256 KB
    const res = await fetch(`${baseUrl}/api/speedtest/download?bytes=${targetBytes}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(targetBytes);
  });

  it('consumes binary streams on /api/speedtest/upload and reports bytesReceived', async () => {
    const payload = crypto.randomBytes(524288); // 512 KB
    const res = await fetch(`${baseUrl}/api/speedtest/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.bytesReceived).toBe(payload.byteLength);
    expect(json.serverMbps).toBeGreaterThan(0);
  });

  it('returns client & node metadata on /api/network-info', async () => {
    const res = await fetch(`${baseUrl}/api/network-info`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.servers)).toBe(true);
    expect(json.servers.length).toBeGreaterThanOrEqual(3);
  });

  it('persists, lists, and deletes speed test history records', async () => {
    const id = `test-run-${Date.now()}`;
    const postRes = await fetch(`${baseUrl}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        downloadMbps: 312.5,
        downloadPeakMbps: 345.0,
        downloadBytes: 25_000_000,
        uploadMbps: 95.4,
        uploadPeakMbps: 110.2,
        uploadBytes: 12_000_000,
        pingMs: 8.4,
        jitterMs: 1.2,
        downloadLoadedPingMs: 11.1,
        uploadLoadedPingMs: 12.5,
        packetLossPct: 0,
        bufferbloatGrade: 'A',
        consistencyPct: 97.2,
      }),
    });
    expect(postRes.status).toBe(200);

    const listRes = await fetch(`${baseUrl}/api/history`);
    const listJson = await listRes.json();
    expect(listJson.records.some((r: { id: string }) => r.id === id)).toBe(true);

    const delRes = await fetch(`${baseUrl}/api/history/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const afterRes = await fetch(`${baseUrl}/api/history`);
    const afterJson = await afterRes.json();
    expect(afterJson.records.some((r: { id: string }) => r.id === id)).toBe(false);
  });
});
