import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Play,
  Square,
  RotateCcw,
  ArrowDown,
  ArrowUp,
  Wifi,
  HardDrive,
  Radio,
} from 'lucide-react';
import { pingOnce, probeLiveBandwidth } from '../lib/engine.ts';
import { computeJitter, formatBytes, formatPing, formatSpeed, mean } from '../lib/format.ts';
import type { LiveSample } from '../types.ts';

interface Props {
  unit: 'Mbps' | 'MB/s';
}

type MonitorMode = 'bandwidth' | 'ping-only';

export default function LiveMonitorPanel({ unit }: Props) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<MonitorMode>('bandwidth');
  const [intervalMs, setIntervalMs] = useState<number>(1500);
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const [sessionBytes, setSessionBytes] = useState(0);
  const [packetFailures, setPacketFailures] = useState(0);
  const [packetTotal, setPacketTotal] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    if (!running) return;
    const ctrl = new AbortController();
    let active = true;

    if (samples.length === 0) {
      startRef.current = performance.now();
    }

    async function loop() {
      while (active && !ctrl.signal.aborted) {
        const t0 = performance.now();
        const relSec = Number(((t0 - startRef.current) / 1000).toFixed(1));

        if (mode === 'bandwidth') {
          const res = await probeLiveBandwidth(ctrl.signal);
          if (!active || ctrl.signal.aborted) break;
          setSessionBytes((prev) => prev + res.bytesUsed);
          setPacketTotal((p) => p + 1);
          if (res.pingMs == null) setPacketFailures((f) => f + 1);
          setSamples((prev) => [
            ...prev.slice(-89),
            {
              t: relSec,
              downloadMbps: Number(res.downloadMbps.toFixed(2)),
              uploadMbps: Number(res.uploadMbps.toFixed(2)),
              pingMs: res.pingMs != null ? Number(res.pingMs.toFixed(1)) : null,
            },
          ]);
        } else {
          const pingMs = await pingOnce(ctrl.signal);
          if (!active || ctrl.signal.aborted) break;
          setSessionBytes((prev) => prev + 180);
          setPacketTotal((p) => p + 1);
          if (pingMs == null) setPacketFailures((f) => f + 1);
          setSamples((prev) => [
            ...prev.slice(-89),
            {
              t: relSec,
              downloadMbps: 0,
              uploadMbps: 0,
              pingMs: pingMs != null ? Number(pingMs.toFixed(1)) : null,
            },
          ]);
        }

        const elapsed = performance.now() - t0;
        const waitMs = Math.max(120, intervalMs - elapsed);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    void loop();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [running, mode, intervalMs]);

  // Draw live dual-trace chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 720;
    const height = 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 52;
    const padR = 16;
    const padT = 16;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const values =
      mode === 'bandwidth'
        ? samples.flatMap((s) => [s.downloadMbps, s.uploadMbps])
        : samples.map((s) => s.pingMs ?? 0);

    const maxVal = Math.max(mode === 'bandwidth' ? 10 : 25, ...values) * 1.18;

    ctx.strokeStyle = 'rgba(100,116,139,0.16)';
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = '10px "JetBrains Mono", monospace';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      const labelVal = maxVal * (1 - i / 4);
      ctx.textAlign = 'right';
      ctx.fillText(
        mode === 'bandwidth'
          ? formatSpeed(labelVal, unit)
          : `${labelVal.toFixed(0)}ms`,
        padL - 8,
        y + 3,
      );
    }

    if (samples.length < 2) {
      ctx.fillStyle = 'rgba(148,163,184,0.65)';
      ctx.textAlign = 'center';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(
        running ? 'COLLECTING LIVE TELEMETRY…' : 'PRESS START LIVE METER TO BEGIN CONTINUOUS MONITORING',
        padL + plotW / 2,
        padT + plotH / 2,
      );
      return;
    }

    const x = (idx: number) => padL + (idx / Math.max(1, samples.length - 1)) * plotW;
    const y = (v: number) => padT + plotH - (Math.min(maxVal, Math.max(0, v)) / maxVal) * plotH;

    const drawSeries = (vals: number[], stroke: string) => {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, `${stroke}44`);
      grad.addColorStop(1, `${stroke}00`);
      ctx.beginPath();
      ctx.moveTo(x(0), y(vals[0]));
      vals.forEach((v, idx) => ctx.lineTo(x(idx), y(v)));
      ctx.lineTo(x(vals.length - 1), padT + plotH);
      ctx.lineTo(x(0), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x(0), y(vals[0]));
      vals.forEach((v, idx) => ctx.lineTo(x(idx), y(v)));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    if (mode === 'bandwidth') {
      drawSeries(
        samples.map((s) => s.downloadMbps),
        '#00F5D4',
      );
      drawSeries(
        samples.map((s) => s.uploadMbps),
        '#8B5CF6',
      );
    } else {
      drawSeries(
        samples.map((s) => s.pingMs ?? 0),
        '#10B981',
      );
    }
  }, [samples, mode, unit, running]);

  const latest = samples[samples.length - 1];
  const validPings = samples.map((s) => s.pingMs).filter((p): p is number => p != null);
  const avgPing = mean(validPings);
  const jitter = computeJitter(validPings);
  const peakDl = samples.reduce((m, s) => Math.max(m, s.downloadMbps), 0);
  const peakUl = samples.reduce((m, s) => Math.max(m, s.uploadMbps), 0);
  const lossPct = packetTotal > 0 ? (packetFailures / packetTotal) * 100 : 0;

  const handleReset = () => {
    setSamples([]);
    setSessionBytes(0);
    setPacketFailures(0);
    setPacketTotal(0);
    startRef.current = performance.now();
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00F5D4]/30 bg-[#00F5D4]/10 text-[#00F5D4]">
            <Radio className={`h-5 w-5 ${running ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Continuous Live Speed & Latency Meter
            </h2>
            <p className="text-xs text-slate-400">
              Real-time throughput, ping stability, jitter & session data usage monitor
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Toggle */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              type="button"
              onClick={() => setMode('bandwidth')}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                mode === 'bandwidth'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DL + UL + Ping
            </button>
            <button
              type="button"
              onClick={() => setMode('ping-only')}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                mode === 'ping-only'
                  ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Zero-Data Ping
            </button>
          </div>

          {/* Interval Selector */}
          <select
            aria-label="Sample interval"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 focus:border-[#00F5D4] focus:outline-none"
          >
            <option value={800}>0.8s Fast</option>
            <option value={1500}>1.5s Standard</option>
            <option value={3000}>3.0s Eco</option>
            <option value={5000}>5.0s Low Data</option>
          </select>

          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
              running
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-[#00F5D4] text-slate-950 hover:bg-[#2efae0]'
            }`}
          >
            {running ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" /> Pause Meter
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" /> Start Live Meter
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300 hover:border-slate-700 hover:text-white"
            title="Reset session counters"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Live Readout Cards */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider">Live Download</span>
            <ArrowDown className="h-4 w-4 text-[#00F5D4]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {mode === 'bandwidth' ? formatSpeed(latest?.downloadMbps ?? 0, unit) : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{unit}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Peak: {formatSpeed(peakDl, unit)} {unit}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider">Live Upload</span>
            <ArrowUp className="h-4 w-4 text-[#8B5CF6]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {mode === 'bandwidth' ? formatSpeed(latest?.uploadMbps ?? 0, unit) : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">{unit}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Peak: {formatSpeed(peakUl, unit)} {unit}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider">Live Ping / Jitter</span>
            <Wifi className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {latest?.pingMs != null ? `${latest.pingMs.toFixed(1)}` : '—'}{' '}
            <span className="text-xs font-normal text-slate-400">ms</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Avg {formatPing(validPings.length ? avgPing : null)} · Jitter {jitter.toFixed(1)} ms
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider">Session Data & Loss</span>
            <HardDrive className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {formatBytes(sessionBytes)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            {packetTotal} probes · Loss {lossPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Live Dual-Trace Graph */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#00F5D4]" />
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-slate-300">
              {mode === 'bandwidth'
                ? `Real-Time Throughput Stream (${unit})`
                : 'Real-Time Latency Stream (ms)'}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs">
            {mode === 'bandwidth' ? (
              <>
                <span className="flex items-center gap-1.5 text-[#00F5D4]">
                  <span className="h-2 w-2 rounded-full bg-[#00F5D4]" /> Download
                </span>
                <span className="flex items-center gap-1.5 text-[#8B5CF6]">
                  <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" /> Upload
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Round-Trip Latency
              </span>
            )}
          </div>
        </div>
        <canvas ref={canvasRef} style={{ width: '100%', height: 220 }} />
      </div>
    </div>
  );
}
