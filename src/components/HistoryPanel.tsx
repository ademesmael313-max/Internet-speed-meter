import { useState } from 'react';
import {
  Trash2,
  Download,
  Copy,
  Check,
  History,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react';
import {
  formatBytes,
  formatSpeed,
  formatTimestamp,
  gradeColor,
  mean,
} from '../lib/format.ts';
import SparkChart from './SparkChart.tsx';
import type { SpeedTestResult } from '../types.ts';

interface Props {
  records: SpeedTestResult[];
  unit: 'Mbps' | 'MB/s';
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export default function HistoryPanel({ records, unit, onDelete, onClearAll }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const avgDl = mean(records.map((r) => r.downloadMbps));
  const avgUl = mean(records.map((r) => r.uploadMbps));
  const avgPing = mean(records.map((r) => r.pingMs));
  const bestDl = records.reduce((m, r) => Math.max(m, r.downloadMbps), 0);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulse-speedtest-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = [
      'Timestamp',
      'Server',
      'Download_Mbps',
      'Download_Peak_Mbps',
      'Upload_Mbps',
      'Upload_Peak_Mbps',
      'Ping_ms',
      'Jitter_ms',
      'DL_Loaded_Ping_ms',
      'UL_Loaded_Ping_ms',
      'Packet_Loss_Pct',
      'Bufferbloat_Grade',
      'Consistency_Pct',
      'Streams',
      'Client_IP',
    ];
    const rows = records.map((r) =>
      [
        r.timestamp,
        `"${r.serverName.replace(/"/g, '""')}"`,
        r.downloadMbps.toFixed(2),
        r.downloadPeakMbps.toFixed(2),
        r.uploadMbps.toFixed(2),
        r.uploadPeakMbps.toFixed(2),
        r.pingMs.toFixed(2),
        r.jitterMs.toFixed(2),
        r.downloadLoadedPingMs.toFixed(2),
        r.uploadLoadedPingMs.toFixed(2),
        r.packetLossPct.toFixed(2),
        r.bufferbloatGrade,
        r.consistencyPct.toFixed(1),
        r.streams,
        r.clientIp,
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulse-speedtest-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySummary = async (r: SpeedTestResult) => {
    const text = [
      `PULSE // NET-METER Speed Report (${formatTimestamp(r.timestamp)})`,
      `• Server: ${r.serverName} (${r.streams}x streams)`,
      `• Download: ${formatSpeed(r.downloadMbps, 'Mbps')} Mbps (Peak ${formatSpeed(r.downloadPeakMbps, 'Mbps')} Mbps)`,
      `• Upload:   ${formatSpeed(r.uploadMbps, 'Mbps')} Mbps (Peak ${formatSpeed(r.uploadPeakMbps, 'Mbps')} Mbps)`,
      `• Latency:  ${r.pingMs.toFixed(1)} ms idle | Jitter ${r.jitterMs.toFixed(1)} ms | Loss ${r.packetLossPct.toFixed(1)}%`,
      `• Bufferbloat Grade: ${r.bufferbloatGrade} (DL loaded ${r.downloadLoadedPingMs.toFixed(1)} ms / UL loaded ${r.uploadLoadedPingMs.toFixed(1)} ms)`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 text-[#8B5CF6]">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Persistent Speed Test History ({records.length})
            </h2>
            <p className="text-xs text-slate-400">
              Stored server-side & locally · Inspect curves, export CSV/JSON, or copy reports
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#00F5D4]/50 hover:text-[#00F5D4]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#00F5D4]/50 hover:text-[#00F5D4]"
            >
              <Download className="h-3.5 w-3.5" /> Export JSON
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear All
            </button>
          </div>
        )}
      </div>

      {/* Aggregate Stats */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/70 p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Average Download
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-[#00F5D4]">
              {formatSpeed(avgDl, unit)} <span className="text-xs text-slate-400">{unit}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/70 p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Average Upload
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-[#8B5CF6]">
              {formatSpeed(avgUl, unit)} <span className="text-xs text-slate-400">{unit}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/70 p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Average Ping
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-emerald-400">
              {avgPing.toFixed(1)} <span className="text-xs text-slate-400">ms</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/70 p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              All-Time Peak DL
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-white">
              {formatSpeed(bestDl, unit)} <span className="text-xs text-slate-400">{unit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Records Table / List */}
      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-[#111827]/40 p-12 text-center">
          <History className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 font-display text-base font-semibold text-slate-300">
            No speed test runs recorded yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Run a test on the Speed Test tab and completed results will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#111827]/75 transition hover:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-[180px]">
                    <div className="font-mono text-xs font-semibold text-slate-200">
                      {formatTimestamp(r.timestamp)}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {r.serverName} · {r.streams}x streams
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 font-mono">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">Download</div>
                      <div className="text-sm font-bold text-[#00F5D4]">
                        ↓ {formatSpeed(r.downloadMbps, unit)} {unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">Upload</div>
                      <div className="text-sm font-bold text-[#8B5CF6]">
                        ↑ {formatSpeed(r.uploadMbps, unit)} {unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">Ping / Jitter</div>
                      <div className="text-sm font-semibold text-slate-200">
                        {r.pingMs.toFixed(1)} ms{' '}
                        <span className="text-xs text-slate-500">±{r.jitterMs.toFixed(1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500">Bufferbloat</div>
                      <div
                        className="text-sm font-bold"
                        style={{ color: gradeColor(r.bufferbloatGrade) }}
                      >
                        Grade {r.bufferbloatGrade}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copySummary(r)}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
                      title="Copy report to clipboard"
                    >
                      {copiedId === r.id ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-red-500/40 hover:text-red-400"
                      title="Delete record"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
                      title="Inspect throughput curves"
                    >
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-800/80 bg-slate-950/50 p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-3">
                        <span className="text-slate-500">DL Transferred:</span>{' '}
                        <span className="text-slate-200">{formatBytes(r.downloadBytes)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-3">
                        <span className="text-slate-500">UL Transferred:</span>{' '}
                        <span className="text-slate-200">{formatBytes(r.uploadBytes)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-3">
                        <span className="text-slate-500">Loaded Ping (DL/UL):</span>{' '}
                        <span className="text-slate-200">
                          {r.downloadLoadedPingMs.toFixed(1)} / {r.uploadLoadedPingMs.toFixed(1)} ms
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-3">
                        <span className="text-slate-500">Consistency:</span>{' '}
                        <span className="text-slate-200">{r.consistencyPct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3.5">
                        <SparkChart
                          data={r.downloadSeries}
                          color="#00F5D4"
                          height={120}
                          label="Download Curve"
                        />
                      </div>
                      <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3.5">
                        <SparkChart
                          data={r.uploadSeries}
                          color="#8B5CF6"
                          height={120}
                          label="Upload Curve"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
