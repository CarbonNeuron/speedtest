export type LatencyStats = {
  min: number;
  avg: number;
  median: number;
  p95: number;
  jitter: number;
};

export function latencyStats(samples: number[]): LatencyStats | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const middle = Math.floor(count / 2);
  return {
    min: sorted[0],
    avg: samples.reduce((sum, n) => sum + n, 0) / count,
    median:
      count % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle],
    p95: sorted[Math.ceil(count * 0.95) - 1],
    jitter:
      count < 2
        ? 0
        : samples
            .slice(1)
            .reduce((sum, n, i) => sum + Math.abs(n - samples[i]), 0) /
          (count - 1),
  };
}

export function toMbps(bytes: number, milliseconds: number) {
  return milliseconds > 0 ? (bytes * 8) / milliseconds / 1000 : 0;
}

export function formatNumber(value: number | null, decimals = 1) {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}
