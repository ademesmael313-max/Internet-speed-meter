import type { NetworkInfo, SpeedTestResult } from '../types.ts';

const API = '/api';

export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  const res = await fetch(`${API}/network-info`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`network-info ${res.status}`);
  return res.json();
}

export async function fetchHistory(): Promise<SpeedTestResult[]> {
  const res = await fetch(`${API}/history`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

export async function saveResult(result: SpeedTestResult): Promise<void> {
  await fetch(`${API}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
}

export async function deleteResult(id: string): Promise<void> {
  await fetch(`${API}/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearHistory(): Promise<void> {
  await fetch(`${API}/history`, { method: 'DELETE' });
}
