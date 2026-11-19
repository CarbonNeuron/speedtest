import type { LatencyStats } from "@/lib/metrics";

export type TestResult = {
  id: string;
  timestamp: number;
  server: string;
  duration: number;
  latency: LatencyStats;
  download: number;
  upload: number;
};

const KEY = "speedtest-history-v1";
export const emptySnapshot = () => "[]";

export function historySnapshot() {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseHistory(raw: string): TestResult[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is TestResult => {
        if (!item || typeof item !== "object") return false;
        return (
          typeof item.id === "string" &&
          typeof item.server === "string" &&
          [
            item.timestamp,
            item.duration,
            item.download,
            item.upload,
            item.latency?.min,
            item.latency?.avg,
            item.latency?.median,
            item.latency?.p95,
            item.latency?.jitter,
          ].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
        );
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function subscribeHistory(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("speedtest-history", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("speedtest-history", callback);
  };
}

export function saveHistory(result: TestResult) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify([result, ...parseHistory(historySnapshot())].slice(0, 5)),
    );
    window.dispatchEvent(new Event("speedtest-history"));
    return true;
  } catch {
    return false;
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("speedtest-history"));
    return true;
  } catch {
    return false;
  }
}
