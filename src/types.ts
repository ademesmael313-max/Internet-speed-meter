export type Phase =
  | 'idle'
  | 'ping'
  | 'download'
  | 'upload'
  | 'done'
  | 'error';

export interface TestSettings {
  streams: number;
  durationSec: number;
  unit: 'Mbps' | 'MB/s';
  serverId: string;
}

export interface SeriesPoint {
  t: number;
  mbps: number;
}

export interface SpeedTestResult {
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
  downloadSeries: SeriesPoint[];
  uploadSeries: SeriesPoint[];
}

export interface NetworkInfo {
  ok: boolean;
  clientIp: string;
  protocol: string;
  httpVersion: string;
  host: string;
  userAgent: string;
  language: string;
  country: string;
  tlsActive: boolean;
  serverNode: {
    id: string;
    name: string;
    location: string;
    hostname: string;
    platform: string;
    cpus: number;
    uptimeSec: number;
  };
  servers: {
    id: string;
    name: string;
    location: string;
    provider: string;
    recommendedStreams: number;
  }[];
  timestamp: string;
}

export interface LiveSample {
  t: number;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number | null;
}
