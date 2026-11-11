import { Tv, Gamepad2, Video, CloudUpload, Clock, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { formatDuration, gradeColor, qualityLabel } from '../lib/format.ts';
import type { SpeedTestResult } from '../types.ts';

interface Props {
  result: SpeedTestResult;
}

type Tier = 'great' | 'fair' | 'poor';

function evalStreaming(dl: number): { tier: Tier; detail: string } {
  if (dl >= 35) return { tier: 'great', detail: '4K HDR @ 60fps multi-device' };
  if (dl >= 15) return { tier: 'great', detail: '1080p Full HD smooth playback' };
  if (dl >= 5) return { tier: 'fair', detail: '720p HD single stream' };
  return { tier: 'poor', detail: 'Buffering likely above 480p' };
}

function evalGaming(ping: number, jitter: number, grade: string): { tier: Tier; detail: string } {
  if (ping <= 35 && jitter <= 8 && (grade === 'A' || grade === 'B')) {
    return { tier: 'great', detail: 'Competitive tick-rate ready' };
  }
  if (ping <= 75 && jitter <= 20 && grade !== 'F') {
    return { tier: 'fair', detail: 'Playable with minor load spikes' };
  }
  return { tier: 'poor', detail: 'High latency or bufferbloat lag' };
}

function evalVideoCalls(dl: number, ul: number, jitter: number): { tier: Tier; detail: string } {
  if (dl >= 15 && ul >= 10 && jitter <= 15) {
    return { tier: 'great', detail: '1080p group calls + screen share' };
  }
  if (dl >= 5 && ul >= 3 && jitter <= 30) {
    return { tier: 'fair', detail: '720p stable video conferencing' };
  }
  return { tier: 'poor', detail: 'Audio-only recommended' };
}

function evalCloudBackup(ul: number): { tier: Tier; detail: string } {
  if (ul >= 50) return { tier: 'great', detail: 'Rapid multi-GB cloud sync' };
  if (ul >= 10) return { tier: 'fair', detail: 'Moderate upload throughput' };
  return { tier: 'poor', detail: 'Large backups will take hours' };
}

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === 'great') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> OPTIMAL
      </span>
    );
  }
  if (tier === 'fair') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" /> GOOD
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-red-400">
      <XCircle className="h-3.5 w-3.5" /> LIMITED
    </span>
  );
}

export default function QualitySuitabilityCard({ result }: Props) {
  const streaming = evalStreaming(result.downloadMbps);
  const gaming = evalGaming(result.pingMs, result.jitterMs, result.bufferbloatGrade);
  const calls = evalVideoCalls(result.downloadMbps, result.uploadMbps, result.jitterMs);
  const cloud = evalCloudBackup(result.uploadMbps);

  const transferSizes = [
    { label: '250 MB App Update', mb: 250 },
    { label: '4 GB HD Movie', mb: 4096 },
    { label: '25 GB 4K Remux', mb: 25600 },
    { label: '80 GB AAA Game', mb: 81920 },
  ];

  const calcSeconds = (mb: number, mbps: number) => {
    if (mbps <= 0.01) return Infinity;
    return (mb * 8) / mbps;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 animate-fade-up">
      {/* Application Readiness Matrix */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Connection Readiness Assessment
            </div>
            <p className="mt-1 text-sm text-slate-200">{qualityLabel(result.downloadMbps)}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5">
            <span className="font-mono text-[11px] text-slate-400">BUFFERBLOAT</span>
            <span
              className="font-mono text-base font-bold"
              style={{ color: gradeColor(result.bufferbloatGrade) }}
            >
              {result.bufferbloatGrade}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Tv className="h-4 w-4 text-[#00F5D4]" /> Video Streaming
              </div>
              <TierBadge tier={streaming.tier} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{streaming.detail}</p>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Gamepad2 className="h-4 w-4 text-[#8B5CF6]" /> Online Gaming
              </div>
              <TierBadge tier={gaming.tier} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{gaming.detail}</p>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Video className="h-4 w-4 text-emerald-400" /> Video Calls
              </div>
              <TierBadge tier={calls.tier} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{calls.detail}</p>
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <CloudUpload className="h-4 w-4 text-amber-400" /> Cloud Sync
              </div>
              <TierBadge tier={cloud.tier} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{cloud.detail}</p>
          </div>
        </div>
      </div>

      {/* Real-World Transfer Time Calculator */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-800/80 bg-[#111827]/75 p-5 backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#00F5D4]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Estimated Transfer Times
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">DL / UL</span>
        </div>

        <div className="mt-3.5 space-y-2.5">
          {transferSizes.map((item) => {
            const dlSec = calcSeconds(item.mb, result.downloadMbps);
            const ulSec = calcSeconds(item.mb, result.uploadMbps);
            return (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 px-3.5 py-2.5"
              >
                <span className="text-xs font-medium text-slate-300">{item.label}</span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-[#00F5D4]" title="Download time">
                    ↓ {isFinite(dlSec) ? formatDuration(Math.max(1, dlSec)) : '—'}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-[#8B5CF6]" title="Upload time">
                    ↑ {isFinite(ulSec) ? formatDuration(Math.max(1, ulSec)) : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
