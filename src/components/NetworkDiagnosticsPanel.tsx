import { useState } from 'react';
import {
  ShieldCheck,
  Globe,
  Server,
  Cpu,
  Zap,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { measurePing } from '../lib/engine.ts';
import { computeJitter, formatDuration, mean, median } from '../lib/format.ts';
import type { NetworkInfo } from '../types.ts';

interface Props {
  netInfo: NetworkInfo | null;
  onRefreshInfo: () => void;
}

interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

export default function NetworkDiagnosticsPanel({ netInfo, onRefreshInfo }: Props) {
  const [sweeping, setSweeping] = useState(false);
  const [samples, setSamples] = useState<(number | null)[]>([]);

  const navConn: NavigatorConnection | undefined =
    typeof navigator !== 'undefined'
      ? ((navigator as unknown as { connection?: NavigatorConnection }).connection ?? undefined)
      : undefined;

  const runPingSweep = async () => {
    if (sweeping) return;
    setSweeping(true);
    setSamples([]);
    try {
      await measurePing(20, undefined, (ms) => {
        setSamples((prev) => [...prev, ms]);
      });
    } finally {
      setSweeping(false);
    }
  };

  const numericSamples = samples.filter((s): s is number => s != null);
  const sorted = [...numericSamples].sort((a, b) => a - b);
  const minMs = sorted.length ? sorted[0] : 0;
  const maxMs = sorted.length ? sorted[sorted.length - 1] : 0;
  const p95Ms = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  const avgMs = mean(numericSamples);
  const medMs = median(numericSamples);
  const jitterMs = computeJitter(numericSamples);
  const lossCount = samples.filter((s) => s == null).length;
  const lossPct = samples.length ? (lossCount / samples.length) * 100 : 0;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Client & Edge Node Info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-[#00F5D4]" />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-slate-300">
                Client Endpoint Telemetry
              </span>
            </div>
            <button
              type="button"
              onClick={onRefreshInfo}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:border-slate-700 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Observed Client IP</dt>
              <dd className="mt-1 font-semibold text-white">{netInfo?.clientIp || 'Detecting…'}</dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Transport Security</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {netInfo ? `${netInfo.protocol} · ${netInfo.httpVersion}` : 'HTTP'}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Browser Radio Hint</dt>
              <dd className="mt-1 font-semibold text-slate-200">
                {navConn?.effectiveType
                  ? `${navConn.effectiveType.toUpperCase()} (${navConn.downlink ?? '?'} Mbps est.)`
                  : 'Standard Broadband'}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Edge Region / Locale</dt>
              <dd className="mt-1 font-semibold text-slate-200">
                {netInfo ? `${netInfo.country} (${netInfo.language})` : '—'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Server className="h-4 w-4 text-[#8B5CF6]" />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-slate-300">
                Measurement Node Specs
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> ONLINE
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Active Core Node</dt>
              <dd className="mt-1 font-semibold text-white">
                {netInfo?.serverNode.name || 'PULSE Cloud Core #01'}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Payload Engine</dt>
              <dd className="mt-1 font-semibold text-[#00F5D4]">High-Entropy Binary</dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Host Architecture</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-slate-200">
                <Cpu className="h-3.5 w-3.5 text-slate-400" />
                {netInfo
                  ? `${netInfo.serverNode.platform} (${netInfo.serverNode.cpus} vCPU)`
                  : 'Linux x64'}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
              <dt className="text-[10px] uppercase text-slate-500">Node Uptime</dt>
              <dd className="mt-1 font-semibold text-slate-200">
                {netInfo ? formatDuration(netInfo.serverNode.uptimeSec) : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* 20-Packet Precision Latency & Jitter Sweep */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-white">
                20-Packet Precision Latency & Jitter Sweep
              </h3>
              <p className="text-xs text-slate-400">
                Measures min, median, p95 tail latency, RFC-3550 jitter, and packet delivery stability
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={sweeping}
            onClick={() => void runPingSweep()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00F5D4] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-[#2efae0] disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            {sweeping ? `Probing (${samples.length}/20)…` : 'Run 20x Ping Sweep'}
          </button>
        </div>

        {samples.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-slate-500">
            Click &ldquo;Run 20x Ping Sweep&rdquo; to inspect per-packet round-trip distribution and tail latency.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 font-mono sm:grid-cols-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">Minimum</div>
                <div className="mt-1 text-sm font-bold text-emerald-400">{minMs.toFixed(1)} ms</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">Median</div>
                <div className="mt-1 text-sm font-bold text-white">{medMs.toFixed(1)} ms</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">Average</div>
                <div className="mt-1 text-sm font-bold text-[#00F5D4]">{avgMs.toFixed(1)} ms</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">P95 Tail</div>
                <div className="mt-1 text-sm font-bold text-amber-400">{p95Ms.toFixed(1)} ms</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">Jitter</div>
                <div className="mt-1 text-sm font-bold text-[#8B5CF6]">{jitterMs.toFixed(2)} ms</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-[10px] uppercase text-slate-500">Packet Loss</div>
                <div className="mt-1 text-sm font-bold text-slate-200">{lossPct.toFixed(1)}%</div>
              </div>
            </div>

            {/* Visual Per-Packet Bar Strip */}
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span>PACKET SEQUENCE #1 – #20</span>
                <span>MAX {maxMs.toFixed(1)} ms</span>
              </div>
              <div className="grid grid-cols-20 gap-1.5 items-end h-28" style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}>
                {Array.from({ length: 20 }).map((_, idx) => {
                  const val = samples[idx];
                  if (val === undefined) {
                    return (
                      <div
                        key={idx}
                        className="h-2 rounded-t bg-slate-800/50"
                        title={`Packet #${idx + 1}: pending`}
                      />
                    );
                  }
                  if (val === null) {
                    return (
                      <div
                        key={idx}
                        className="h-full rounded-t bg-red-500/60"
                        title={`Packet #${idx + 1}: LOST`}
                      />
                    );
                  }
                  const pct = Math.max(12, Math.round((val / Math.max(1, maxMs)) * 100));
                  return (
                    <div
                      key={idx}
                      style={{ height: `${pct}%` }}
                      className="rounded-t bg-gradient-to-t from-[#00F5D4]/60 to-[#00F5D4] transition-all"
                      title={`Packet #${idx + 1}: ${val.toFixed(2)} ms`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
