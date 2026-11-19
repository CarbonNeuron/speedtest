import { describe, expect, test } from "bun:test";
import { latencyStats, toMbps } from "@/lib/metrics";
import { parseHistory } from "@/lib/history";
import { testId } from "@/lib/id";

describe("latency statistics", () => {
  test("handles empty and single-sample measurements", () => {
    expect(latencyStats([])).toBeNull();
    expect(latencyStats([7])).toEqual({
      min: 7,
      avg: 7,
      median: 7,
      p95: 7,
      jitter: 0,
    });
  });
  test("uses nearest-rank p95 and consecutive-sample jitter without sorting the input", () => {
    const samples = [10, 30, 20, 40];
    expect(latencyStats(samples)).toEqual({
      min: 10,
      avg: 25,
      median: 25,
      p95: 40,
      jitter: 50 / 3,
    });
    expect(samples).toEqual([10, 30, 20, 40]);
    expect(latencyStats(Array.from({ length: 20 }, (_, i) => i + 1))?.p95).toBe(
      19,
    );
    expect(latencyStats([9, 1, 5])?.median).toBe(5);
  });
  test("converts bytes and milliseconds to decimal megabits per second", () => {
    expect(toMbps(12500000, 1000)).toBe(100);
    expect(toMbps(100, 0)).toBe(0);
  });
});

test("corrupt or invalid local history cannot break the page", () => {
  expect(parseHistory("bad json")).toEqual([]);
  expect(parseHistory('{"not":"an array"}')).toEqual([]);
  expect(parseHistory('[null,{}, {"id":"x","download":-1}]')).toEqual([]);
  const valid = {
    id: "test",
    timestamp: 1,
    server: "localhost",
    duration: 10,
    latency: latencyStats([2]),
    download: 100,
    upload: 50,
  };
  expect(parseHistory(JSON.stringify(Array(8).fill(valid)))).toHaveLength(5);
});

test("cache-busting identifiers work without secure-origin-only randomUUID", () => {
  expect(testId()).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{8}){3}$/);
  expect(testId()).not.toBe(testId());
});
