import { describe, expect, it } from 'vitest';
import {
  bufferbloatGrade,
  bytesToMbps,
  computeJitter,
  formatBytes,
  formatSpeed,
  gaugeMax,
  mean,
  median,
} from '../src/lib/format.ts';
import { consistency } from '../src/lib/engine.ts';

describe('format & telemetry math utilities', () => {
  it('converts bytes and elapsed seconds to Mbps accurately', () => {
    // 12,500,000 bytes in 1 second = 100 Mbps
    expect(bytesToMbps(12_500_000, 1)).toBeCloseTo(100, 4);
    expect(bytesToMbps(0, 5)).toBe(0);
    expect(bytesToMbps(1000, 0)).toBe(0);
  });

  it('formats speeds in Mbps and MB/s', () => {
    expect(formatSpeed(80, 'Mbps')).toBe('80.00');
    expect(formatSpeed(80, 'MB/s')).toBe('10.00');
    expect(formatSpeed(250.44, 'Mbps')).toBe('250.4');
  });

  it('formats byte sizes cleanly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.00 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });

  it('computes RFC-3550 consecutive jitter', () => {
    expect(computeJitter([10, 14, 12, 18])).toBeCloseTo((4 + 2 + 6) / 3, 5);
    expect(computeJitter([15])).toBe(0);
  });

  it('computes mean and median', () => {
    expect(mean([10, 20, 30])).toBe(20);
    expect(median([10, 100, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('grades bufferbloat from loaded ping delta', () => {
    expect(bufferbloatGrade(12, 15)).toBe('A');
    expect(bufferbloatGrade(12, 22)).toBe('B');
    expect(bufferbloatGrade(12, 35)).toBe('C');
    expect(bufferbloatGrade(12, 60)).toBe('D');
    expect(bufferbloatGrade(12, 120)).toBe('F');
  });

  it('scales gauge dial maximum cleanly', () => {
    expect(gaugeMax(0)).toBe(100);
    expect(gaugeMax(42)).toBe(50);
    expect(gaugeMax(135)).toBe(200);
    expect(gaugeMax(680)).toBe(1000);
  });

  it('evaluates throughput series consistency', () => {
    const steady = [
      { t: 0.2, mbps: 100 },
      { t: 0.4, mbps: 101 },
      { t: 0.6, mbps: 99 },
      { t: 0.8, mbps: 100 },
    ];
    expect(consistency(steady)).toBeGreaterThan(98);
  });
});
