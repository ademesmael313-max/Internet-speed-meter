import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Gauge as GaugeIcon,
  Radio,
  History,
  Stethoscope,
  Play,
  Square,
  ArrowDown,
  ArrowUp,
  Activity,
  Shield,
  Sliders,
  Server,
  Sparkles,
} from 'lucide-react';
import Gauge from './components/Gauge.tsx';
import SparkChart from './components/SparkChart.tsx';
import QualitySuitabilityCard from './components/QualitySuitabilityCard.tsx';
import LiveMonitorPanel from './components/LiveMonitorPanel.tsx';
import HistoryPanel from './components/HistoryPanel.tsx';
import NetworkDiagnosticsPanel from './components/NetworkDiagnosticsPanel.tsx';
import {
  clearHistory,
  deleteResult,
  fetchHistory,
  fetchNetworkInfo,
  saveResult,
} from './lib/api.ts';
import {
  consistency,
  measureDownload,
  measurePing,
  measureUpload,
} from './lib/engine.ts';
import {
  bufferbloatGrade,
  formatBytes,
  formatSpeed,
  gradeColor,
  mean,
  uid,
} from './lib/format.ts';
import type {
  NetworkInfo,
  Phase,
  SeriesPoint,
  SpeedTestResult,
  TestSettings,
} from './types.ts';

type Tab = 'speedtest' | 'live' | 'history' | 'diagnostics';

const LOCAL_STORAGE_KEY = 'pulse_speedtest_history_v1';

export default function App() {
  const [tab, setTab] = useState<Tab>('speedtest');
  const [settings, setSettings] = useState<TestSettings>({
    streams: 4,
    durationSec: 6,
    unit: 'Mbps',
    serverId: 'pulse-cloud-01',
  });
  const [throttleMbps, setThrottleMbps] = useState<number>(0);

  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [history, setHistory] = useState<SpeedTestResult[]>([]);

  // Active speed test state
  const [phase, setPhase] = useState<Phase>('idle');
  const [phaseProgress, setPhaseProgress] = useState<number>(0);
  const [liveGaugeMbps, setLiveGaugeMbps] = useState<number>(0);

  const [pingMs, setPingMs] = useState<number>(0);
  const [jitterMs, setJitterMs] = useState<number>(0);
  const [packetLossPct, setPacketLossPct] = useState<number>(0);

  const [downloadMbps, setDownloadMbps] = useState<number>(0);
  const [downloadPeakMbps, setDownloadPeakMbps] = useState<number>(0);
  const [downloadBytes, setDownloadBytes] = useState<number>(0);
  const [downloadSeries, setDownloadSeries] = useState<SeriesPoint[]>([]);
  const [dlLoadedPingMs, setDlLoadedPingMs] = useState<number>(0);

  const [uploadMbps, setUploadMbps] = useState<number>(0);
  const [uploadPeakMbps, setUploadPeakMbps] = useState<number>(0);
  const [uploadBytes, setUploadBytes] = useState<number>(0);
  const [uploadSeries, setUploadSeries] = useState<SeriesPoint[]>([]);
  const [ulLoadedPingMs, setUlLoadedPingMs] = useState<number>(0);

  const [latestResult, setLatestResult] = useState<SpeedTestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadInfoAndHistory = useCallback(async () => {
    try {
      const info = await fetchNetworkInfo();
      setNetInfo(info);
    } catch {
      /* ignore transient error */
    }
    try {
      const serverRecords = await fetchHistory();
      if (serverRecords.length > 0) {
        setHistory(serverRecords);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverRecords.slice(0, 50)));
        return;
      }
    } catch {
      /* fallback to localStorage */
    }
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void loadInfoAndHistory();
  }, [loadInfoAndHistory]);

  const selectedServer =
    netInfo?.servers.find((s) => s.id === settings.serverId) || {
      id: 'pulse-cloud-01',
      name: 'PULSE Cloud Core #01',
      location: 'Primary Edge Gateway',
      provider: 'Direct Full-Duplex Node',
      recommendedStreams: 4,
    };

  const handleServerChange = (serverId: string) => {
    const srv = netInfo?.servers.find((s) => s.id === serverId);
    setSettings((prev) => ({
      ...prev,
      serverId,
      streams: srv ? srv.recommendedStreams : prev.streams,
    }));
  };

  const stopTest = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setPhaseProgress(0);
    setLiveGaugeMbps(0);
  };

  const startSpeedTest = async () => {
    if (phase === 'ping' || phase === 'download' || phase === 'upload') {
      stopTest();
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setErrorMsg(null);
    setLatestResult(null);
    setPingMs(0);
    setJitterMs(0);
    setPacketLossPct(0);
    setDownloadMbps(0);
    setDownloadPeakMbps(0);
    setDownloadBytes(0);
    setDownloadSeries([]);
    setDlLoadedPingMs(0);
    setUploadMbps(0);
    setUploadPeakMbps(0);
    setUploadBytes(0);
    setUploadSeries([]);
    setUlLoadedPingMs(0);
    setLiveGaugeMbps(0);

    try {
      // 1. Ping & Jitter Phase
      setPhase('ping');
      setPhaseProgress(0.05);
      const pingRes = await measurePing(12, ctrl.signal, (ms, idx, total) => {
        if (ms != null) setPingMs(ms);
        setPhaseProgress((idx / total) * 0.2);
      });
      if (ctrl.signal.aborted) return;

      const idlePing = pingRes.avgMs;
      setPingMs(idlePing);
      setJitterMs(pingRes.jitterMs);
      setPacketLossPct(pingRes.lossPct);

      // 2. Download Throughput + Loaded Latency Phase
      setPhase('download');
      const dlLoadedSamples: number[] = [];
      const dlRes = await measureDownload(
        settings.streams,
        settings.durationSec,
        ctrl.signal,
        (mbps, bytes, prog) => {
          setLiveGaugeMbps(mbps);
          setDownloadMbps(mbps);
          setDownloadBytes(bytes);
          setPhaseProgress(0.2 + prog * 0.4);
        },
        (loadedMs) => {
          if (loadedMs != null) {
            dlLoadedSamples.push(loadedMs);
            setDlLoadedPingMs(mean(dlLoadedSamples));
          }
        },
        throttleMbps,
      );
      if (ctrl.signal.aborted) return;

      setDownloadMbps(dlRes.mbps);
      setDownloadPeakMbps(dlRes.peakMbps);
      setDownloadBytes(dlRes.bytes);
      setDownloadSeries(dlRes.series);
      const finalDlLoaded = dlLoadedSamples.length ? mean(dlLoadedSamples) : idlePing;
      setDlLoadedPingMs(finalDlLoaded);

      // Brief settle before upload saturation
      setLiveGaugeMbps(0);
      await new Promise((r) => setTimeout(r, 250));
      if (ctrl.signal.aborted) return;

      // 3. Upload Throughput + Loaded Latency Phase
      setPhase('upload');
      const ulLoadedSamples: number[] = [];
      const ulRes = await measureUpload(
        settings.streams,
        settings.durationSec,
        ctrl.signal,
        (mbps, bytes, prog) => {
          setLiveGaugeMbps(mbps);
          setUploadMbps(mbps);
          setUploadBytes(bytes);
          setPhaseProgress(0.6 + prog * 0.4);
        },
        (loadedMs) => {
          if (loadedMs != null) {
            ulLoadedSamples.push(loadedMs);
            setUlLoadedPingMs(mean(ulLoadedSamples));
          }
        },
      );
      if (ctrl.signal.aborted) return;

      setUploadMbps(ulRes.mbps);
      setUploadPeakMbps(ulRes.peakMbps);
      setUploadBytes(ulRes.bytes);
      setUploadSeries(ulRes.series);
      const finalUlLoaded = ulLoadedSamples.length ? mean(ulLoadedSamples) : idlePing;
      setUlLoadedPingMs(finalUlLoaded);

      // Finalize record
      const avgLoadedPing = (finalDlLoaded + finalUlLoaded) / 2;
      const grade = bufferbloatGrade(idlePing, avgLoadedPing);
      const linkConsistency = (consistency(dlRes.series) + consistency(ulRes.series)) / 2;

      const record: SpeedTestResult = {
        id: uid(),
        timestamp: new Date().toISOString(),
        serverName: selectedServer.name,
        serverLocation: selectedServer.location,
        streams: settings.streams,
        durationSec: settings.durationSec,
        downloadMbps: Number(dlRes.mbps.toFixed(2)),
        downloadPeakMbps: Number(dlRes.peakMbps.toFixed(2)),
        downloadBytes: dlRes.bytes,
        uploadMbps: Number(ulRes.mbps.toFixed(2)),
        uploadPeakMbps: Number(ulRes.peakMbps.toFixed(2)),
        uploadBytes: ulRes.bytes,
        pingMs: Number(idlePing.toFixed(2)),
        jitterMs: Number(pingRes.jitterMs.toFixed(2)),
        downloadLoadedPingMs: Number(finalDlLoaded.toFixed(2)),
        uploadLoadedPingMs: Number(finalUlLoaded.toFixed(2)),
        packetLossPct: Number(pingRes.lossPct.toFixed(2)),
        bufferbloatGrade: grade,
        consistencyPct: Number(linkConsistency.toFixed(1)),
        clientIp: netInfo?.clientIp || '127.0.0.1',
        connectionType: 'Broadband',
        downloadSeries: dlRes.series,
        uploadSeries: ulRes.series,
      };

      setLatestResult(record);
      setLiveGaugeMbps(dlRes.mbps);
      setPhase('done');
      setPhaseProgress(1);

      setHistory((prev) => {
        const next = [record, ...prev].slice(0, 100);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
        } catch {
          /* ignore */
        }
        return next;
      });
      void saveResult(record).catch(() => undefined);
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setPhase('error');
        setErrorMsg(err instanceof Error ? err.message : 'Speed test interrupted');
      }
    }
  };

  const handleDeleteRecord = async (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((r) => r.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
      return next;
    });
    await deleteResult(id).catch(() => undefined);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    await clearHistory().catch(() => undefined);
  };

  const isRunning = phase === 'ping' || phase === 'download' || phase === 'upload';

  const phaseLabel = (() => {
    switch (phase) {
      case 'ping':
        return 'PROBING LATENCY & JITTER';
      case 'download':
        return `MEASURING DOWNLOAD (${settings.streams}x STREAMS)`;
      case 'upload':
        return `MEASURING UPLOAD (${settings.streams}x STREAMS)`;
      case 'done':
        return 'TELEMETRY COMPLETE — SUSTAINED DL';
      case 'error':
        return 'TEST ERROR';
      default:
        return 'READY FOR FULL-DUPLEX PROBE';
    }
  })();

  const currentBloatGrade =
    latestResult?.bufferbloatGrade ||
    (pingMs > 0 && (dlLoadedPingMs > 0 || ulLoadedPingMs > 0)
      ? bufferbloatGrade(
          pingMs,
          mean([dlLoadedPingMs, ulLoadedPingMs].filter((x) => x > 0)),
        )
      : '—');

  return (
    <div className="min-h-screen bg-[#090D16] bg-grid text-slate-100 flex flex-col">
      {/* Ambient radial glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-gradient-to-b from-[#00F5D4]/[0.06] via-[#8B5CF6]/[0.03] to-transparent" />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090D16]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00F5D4]/40 bg-[#00F5D4]/10 shadow-[0_0_20px_rgba(0,245,212,0.18)]">
              <GaugeIcon className="h-5 w-5 text-[#00F5D4]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold tracking-tight text-white">
                  PULSE <span className="text-[#00F5D4]">//</span> NET-METER
                </span>
                <span className="hidden rounded-md border border-slate-700/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">
                  v1.0
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Precision Speed, Live Bandwidth & Bufferbloat Suite
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav
            aria-label="Primary sections"
            className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1"
          >
            <button
              type="button"
              onClick={() => setTab('speedtest')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                tab === 'speedtest'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GaugeIcon className="h-3.5 w-3.5" />
              <span>Speed Test</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                tab === 'live'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Live Meter</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                tab === 'history'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
              {history.length > 0 && (
                <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
                  {history.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('diagnostics')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                tab === 'diagnostics'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Diagnostics</span>
            </button>
          </nav>

          {/* Unit Switcher */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, unit: 'Mbps' }))}
                className={`rounded-lg px-2.5 py-1 transition ${
                  settings.unit === 'Mbps'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mbps
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, unit: 'MB/s' }))}
                className={`rounded-lg px-2.5 py-1 transition ${
                  settings.unit === 'MB/s'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                MB/s
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {tab === 'speedtest' && (
          <div className="space-y-6">
            {/* Configuration Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-[#111827]/75 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Server className="h-4 w-4 text-[#00F5D4]" />
                  <select
                    aria-label="Target server"
                    disabled={isRunning}
                    value={settings.serverId}
                    onChange={(e) => handleServerChange(e.target.value)}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#00F5D4] focus:outline-none disabled:opacity-60"
                  >
                    {(netInfo?.servers || [selectedServer]).map((srv) => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name} — {srv.location}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                  <Sliders className="h-3.5 w-3.5 text-[#8B5CF6]" />
                  <span>Streams:</span>
                  <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                    {[1, 2, 4, 8].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setSettings((s) => ({ ...s, streams: n }))}
                        className={`rounded-md px-2 py-0.5 text-xs transition ${
                          settings.streams === n
                            ? 'bg-[#8B5CF6]/25 text-[#c4b5fd] font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        } disabled:opacity-50`}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                  <span>Duration:</span>
                  <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                    {[4, 6, 10, 15].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setSettings((s) => ({ ...s, durationSec: sec }))}
                        className={`rounded-md px-2 py-0.5 text-xs transition ${
                          settings.durationSec === sec
                            ? 'bg-[#00F5D4]/20 text-[#00F5D4] font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        } disabled:opacity-50`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <label className="flex items-center gap-2 text-slate-400">
                  <span>Rate Limit:</span>
                  <select
                    aria-label="Download rate cap"
                    disabled={isRunning}
                    value={throttleMbps}
                    onChange={(e) => setThrottleMbps(Number(e.target.value))}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-[#00F5D4] focus:outline-none disabled:opacity-50"
                  >
                    <option value={0}>Unthrottled Max</option>
                    <option value={250}>Cap 250 Mbps</option>
                    <option value={100}>Cap 100 Mbps</option>
                    <option value={50}>Cap 50 Mbps</option>
                    <option value={25}>Cap 25 Mbps</option>
                    <option value={10}>Cap 10 Mbps</option>
                  </select>
                </label>

                <span className="hidden rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-400 md:inline">
                  IP: <strong className="text-slate-200">{netInfo?.clientIp || '…'}</strong>
                </span>
              </div>
            </div>

            {/* Hero Gauge + KPI Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left: Precision Dial + Action Button */}
              <div className="lg:col-span-5 flex flex-col items-center justify-between rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-6 backdrop-blur">
                <Gauge
                  mbps={liveGaugeMbps}
                  phase={phase}
                  unit={settings.unit}
                  label={phaseLabel}
                />

                {/* Phase Progress Stepper */}
                <div className="w-full max-w-sm space-y-2">
                  <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    <span className={phase === 'ping' ? 'text-[#00F5D4] font-bold' : ''}>
                      1. Ping
                    </span>
                    <span className={phase === 'download' ? 'text-[#00F5D4] font-bold' : ''}>
                      2. Download
                    </span>
                    <span className={phase === 'upload' ? 'text-[#8B5CF6] font-bold' : ''}>
                      3. Upload
                    </span>
                    <span className={phase === 'done' ? 'text-emerald-400 font-bold' : ''}>
                      4. Report
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00F5D4] to-[#8B5CF6] transition-all duration-200"
                      style={{ width: `${Math.round(phaseProgress * 100)}%` }}
                    />
                  </div>
                </div>

                {errorMsg && (
                  <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
                    {errorMsg}
                  </p>
                )}

                {/* Primary Start / Stop CTA */}
                <div className="mt-5 flex w-full max-w-sm items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startSpeedTest()}
                    className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-6 py-4 font-display text-base font-bold uppercase tracking-wider transition-all ${
                      isRunning
                        ? 'border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                        : 'bg-[#00F5D4] text-slate-950 shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-[#2efae0] hover:shadow-[0_0_40px_rgba(0,245,212,0.45)]'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <Square className="h-4 w-4 fill-current" /> Abort Test
                      </>
                    ) : (
                      <>
                        <Play className="h-5 w-5 fill-current" />{' '}
                        {phase === 'done' ? 'Run Speed Test Again' : 'Start Speed Test'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right: Live Telemetry Readout Cards + Dual SparkCharts */}
              <div className="lg:col-span-7 flex flex-col justify-between gap-4">
                {/* 4 Primary KPI Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Download Card */}
                  <div
                    className={`rounded-2xl border p-5 transition ${
                      phase === 'download'
                        ? 'border-[#00F5D4]/60 bg-[#00F5D4]/[0.06] shadow-[0_0_25px_rgba(0,245,212,0.1)]'
                        : 'border-slate-800/80 bg-[#111827]/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">
                        Download Speed
                      </span>
                      <ArrowDown className="h-4 w-4 text-[#00F5D4]" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        data-testid="download-speed-value"
                        className="font-mono text-4xl font-bold text-white tabular-nums"
                      >
                        {downloadMbps > 0 ? formatSpeed(downloadMbps, settings.unit) : '—'}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{settings.unit}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-500">
                      <span>
                        Peak:{' '}
                        {downloadPeakMbps > 0
                          ? `${formatSpeed(downloadPeakMbps, settings.unit)} ${settings.unit}`
                          : '—'}
                      </span>
                      <span>{downloadBytes > 0 ? formatBytes(downloadBytes) : '0 B'}</span>
                    </div>
                  </div>

                  {/* Upload Card */}
                  <div
                    className={`rounded-2xl border p-5 transition ${
                      phase === 'upload'
                        ? 'border-[#8B5CF6]/60 bg-[#8B5CF6]/[0.07] shadow-[0_0_25px_rgba(139,92,246,0.12)]'
                        : 'border-slate-800/80 bg-[#111827]/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">
                        Upload Speed
                      </span>
                      <ArrowUp className="h-4 w-4 text-[#8B5CF6]" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        data-testid="upload-speed-value"
                        className="font-mono text-4xl font-bold text-white tabular-nums"
                      >
                        {uploadMbps > 0 ? formatSpeed(uploadMbps, settings.unit) : '—'}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{settings.unit}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-500">
                      <span>
                        Peak:{' '}
                        {uploadPeakMbps > 0
                          ? `${formatSpeed(uploadPeakMbps, settings.unit)} ${settings.unit}`
                          : '—'}
                      </span>
                      <span>{uploadBytes > 0 ? formatBytes(uploadBytes) : '0 B'}</span>
                    </div>
                  </div>

                  {/* Unloaded Ping & Jitter */}
                  <div
                    className={`rounded-2xl border p-5 transition ${
                      phase === 'ping'
                        ? 'border-emerald-400/60 bg-emerald-500/[0.06]'
                        : 'border-slate-800/80 bg-[#111827]/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">
                        Idle Latency & Jitter
                      </span>
                      <Activity className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        data-testid="ping-value"
                        className="font-mono text-3xl font-bold text-white tabular-nums"
                      >
                        {pingMs > 0 ? pingMs.toFixed(1) : '—'}
                      </span>
                      <span className="font-mono text-xs text-slate-400">ms</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-500">
                      <span>Jitter: {jitterMs > 0 ? `${jitterMs.toFixed(2)} ms` : '—'}</span>
                      <span>Loss: {pingMs > 0 ? `${packetLossPct.toFixed(1)}%` : '—'}</span>
                    </div>
                  </div>

                  {/* Loaded Latency & Bufferbloat Grade */}
                  <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">
                        Bufferbloat & Loaded Ping
                      </span>
                      <Shield className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-mono text-3xl font-bold"
                          style={{
                            color:
                              currentBloatGrade !== '—'
                                ? gradeColor(currentBloatGrade)
                                : '#F8FAFC',
                          }}
                        >
                          {currentBloatGrade !== '—' ? `Grade ${currentBloatGrade}` : '—'}
                        </span>
                      </div>
                      {latestResult && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                          <Sparkles className="h-3 w-3 text-[#00F5D4]" />
                          {latestResult.consistencyPct.toFixed(0)}% stable
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-500">
                      <span>
                        ↓ Load: {dlLoadedPingMs > 0 ? `${dlLoadedPingMs.toFixed(1)} ms` : '—'}
                      </span>
                      <span>
                        ↑ Load: {ulLoadedPingMs > 0 ? `${ulLoadedPingMs.toFixed(1)} ms` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real-Time Throughput SparkCharts */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-4">
                    <SparkChart
                      data={downloadSeries}
                      color="#00F5D4"
                      height={135}
                      label="Download Stream"
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/80 p-4">
                    <SparkChart
                      data={uploadSeries}
                      color="#8B5CF6"
                      height={135}
                      label="Upload Stream"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Readiness Matrix & File Transfer Calculator (shown for latest or most recent saved test) */}
            {(latestResult || history[0]) && (
              <QualitySuitabilityCard result={latestResult || history[0]} />
            )}
          </div>
        )}

        {tab === 'live' && <LiveMonitorPanel unit={settings.unit} />}

        {tab === 'history' && (
          <HistoryPanel
            records={history}
            unit={settings.unit}
            onDelete={(id) => void handleDeleteRecord(id)}
            onClearAll={() => void handleClearHistory()}
          />
        )}

        {tab === 'diagnostics' && (
          <NetworkDiagnosticsPanel
            netInfo={netInfo}
            onRefreshInfo={() => void loadInfoAndHistory()}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/70 bg-[#090D16]/90 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 font-mono text-[11px] text-slate-500 sm:px-6">
          <span>
            PULSE // NET-METER — High-Entropy Multi-Stream Bandwidth & Bufferbloat Engine
          </span>
          <span>
            Active Node: {selectedServer.name} · Streams: {settings.streams}x · Unit:{' '}
            {settings.unit}
          </span>
        </div>
      </footer>
    </div>
  );
}
