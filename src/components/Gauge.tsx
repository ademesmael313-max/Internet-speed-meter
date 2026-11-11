import { useMemo } from 'react';
import { gaugeMax, formatSpeed } from '../lib/format.ts';
import type { Phase } from '../types.ts';

interface Props {
  mbps: number;
  phase: Phase;
  unit: 'Mbps' | 'MB/s';
  label: string;
}

const START_ANGLE = -210; // degrees, SVG rotate space
const SWEEP = 240;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export default function Gauge({ mbps, phase, unit, label }: Props) {
  const max = useMemo(() => gaugeMax(mbps), [mbps]);
  const frac = Math.min(1, mbps / max);
  const valueAngle = START_ANGLE + frac * SWEEP;
  const endAngle = START_ANGLE + SWEEP;

  const active = phase === 'download' || phase === 'upload';
  const color = phase === 'upload' ? '#8B5CF6' : '#00F5D4';

  const ticks = useMemo(() => {
    const out: { angle: number; major: boolean; label?: string }[] = [];
    for (let i = 0; i <= 24; i++) {
      const angle = START_ANGLE + (i / 24) * SWEEP;
      const major = i % 6 === 0;
      out.push({
        angle,
        major,
        label: major ? formatSpeed((max * i) / 24, unit) : undefined,
      });
    }
    return out;
  }, [max, unit]);

  const needleTip = polar(160, 160, 108, valueAngle);
  const needleTail = polar(160, 160, 22, valueAngle + 180);

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <svg viewBox="0 0 320 320" className="w-full h-auto" role="img" aria-label={`${label} gauge`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00F5D4" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="gaugeGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <path d={arcPath(160, 160, 128, START_ANGLE, endAngle)} stroke="#1E293B" strokeWidth="14" fill="none" strokeLinecap="round" />
        {/* value arc */}
        {frac > 0.004 && (
          <path
            d={arcPath(160, 160, 128, START_ANGLE, valueAngle)}
            stroke={active ? 'url(#gaugeGrad)' : '#334155'}
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            filter={active ? 'url(#gaugeGlow)' : undefined}
            style={{ transition: 'all 0.15s linear' }}
          />
        )}

        {/* ticks */}
        {ticks.map((t, i) => {
          const inner = polar(160, 160, t.major ? 100 : 106, t.angle);
          const outer = polar(160, 160, 112, t.angle);
          const textPos = polar(160, 160, 84, t.angle);
          return (
            <g key={i}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={t.major ? '#475569' : '#1E293B'} strokeWidth={t.major ? 2 : 1} />
              {t.label && (
                <text x={textPos.x} y={textPos.y} textAnchor="middle" dominantBaseline="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  {t.label}
                </text>
              )}
            </g>
          );
        })}

        {/* needle */}
        <line x1={needleTail.x} y1={needleTail.y} x2={needleTip.x} y2={needleTip.y} stroke="#F8FAFC" strokeWidth="3.5" strokeLinecap="round" style={{ transition: 'all 0.15s linear' }} />
        <circle cx="160" cy="160" r="12" fill="#0F172A" stroke="#334155" strokeWidth="2" />
        <circle cx="160" cy="160" r="5" fill={active ? color : '#475569'} />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-10">
        <div className="font-mono font-bold text-5xl md:text-6xl tracking-tight text-white tabular-nums">
          {formatSpeed(mbps, unit)}
        </div>
        <div className="mt-1 font-mono text-xs uppercase tracking-[0.3em] text-slate-400">{unit}</div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: active ? color : '#334155', boxShadow: active ? `0 0 8px ${color}` : 'none' }}
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-400">{label}</span>
        </div>
      </div>
    </div>
  );
}
