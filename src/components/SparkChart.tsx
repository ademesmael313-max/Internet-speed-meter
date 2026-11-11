import { useEffect, useRef } from 'react';
import type { SeriesPoint } from '../types.ts';

interface Props {
  data: SeriesPoint[];
  color: string;
  height?: number;
  label: string;
}

/** Lightweight canvas line chart with gradient fill + peak marker. */
export default function SparkChart({ data, color, height = 140, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 600;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 44;
    const padR = 10;
    const padT = 12;
    const padB = 20;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxV = Math.max(1, ...data.map((p) => p.mbps)) * 1.15;
    const maxT = Math.max(1, ...data.map((p) => p.t));

    // gridlines
    ctx.strokeStyle = 'rgba(100,116,139,0.15)';
    ctx.fillStyle = 'rgba(100,116,139,0.8)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      const val = maxV * (1 - i / 3);
      ctx.textAlign = 'right';
      ctx.fillText(val >= 100 ? val.toFixed(0) : val.toFixed(1), padL - 6, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText('0s', padL, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${maxT.toFixed(0)}s`, padL + plotW, height - 6);

    if (data.length < 2) {
      ctx.fillStyle = 'rgba(100,116,139,0.6)';
      ctx.textAlign = 'center';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('AWAITING SAMPLES…', padL + plotW / 2, padT + plotH / 2);
      return;
    }

    const x = (t: number) => padL + (t / maxT) * plotW;
    const y = (v: number) => padT + plotH - (v / maxV) * plotH;

    // area fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, `${color}55`);
    grad.addColorStop(1, `${color}00`);
    ctx.beginPath();
    ctx.moveTo(x(data[0].t), y(data[0].mbps));
    for (const p of data) ctx.lineTo(x(p.t), y(p.mbps));
    ctx.lineTo(x(data[data.length - 1].t), padT + plotH);
    ctx.lineTo(x(data[0].t), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(x(data[0].t), y(data[0].mbps));
    for (const p of data) ctx.lineTo(x(p.t), y(p.mbps));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // peak marker
    const peak = data.reduce((a, b) => (b.mbps > a.mbps ? b : a), data[0]);
    ctx.beginPath();
    ctx.arc(x(peak.t), y(peak.mbps), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(248,250,252,0.9)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`peak ${peak.mbps.toFixed(1)}`, x(peak.t), y(peak.mbps) - 10);
  }, [data, color, height]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-400">{label}</span>
        <span className="font-mono text-[11px] text-slate-500">Mbps over time</span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height }} aria-label={label} />
    </div>
  );
}
