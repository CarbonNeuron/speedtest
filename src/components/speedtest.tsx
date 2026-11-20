"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Icon, type IconName } from "@/components/icon";
import { ThroughputChart } from "@/components/throughput-chart";
import {
  clearHistory,
  emptySnapshot,
  historySnapshot,
  parseHistory,
  saveHistory,
  subscribeHistory,
} from "@/lib/history";
import { formatNumber, latencyStats } from "@/lib/metrics";
import { testId } from "@/lib/id";
import {
  measureDownload,
  measureLatency,
  measureUpload,
  PING_COUNT,
  type ThroughputPoint,
  type TransferUpdate,
} from "@/lib/speedtest";

type Phase =
  | "idle"
  | "latency"
  | "download"
  | "upload"
  | "complete"
  | "cancelled"
  | "error";
const stages = ["latency", "download", "upload"] as const;
const noSubscription = () => () => {};
const serverSnapshot = () => window.location.host;
const initialServer = () => "This server";

function Metric({
  icon,
  title,
  value,
  unit,
  active,
  complete,
}: {
  icon: IconName;
  title: string;
  value: number | null;
  unit: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${active ? "border-violet-500/40 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/50"}`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-zinc-400">
          <Icon
            name={icon}
            className={`h-4 w-4 ${active ? "text-violet-400" : "text-zinc-500"}`}
          />
          {title}
        </span>
        {complete && <Icon name="check" className="h-4 w-4 text-emerald-400" />}
        {active && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">
          {formatNumber(value)}
        </span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

export function Speedtest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [duration, setDuration] = useState(10);
  const [samples, setSamples] = useState<number[]>([]);
  const [download, setDownload] = useState<number | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [downloadPoints, setDownloadPoints] = useState<ThroughputPoint[]>([]);
  const [uploadPoints, setUploadPoints] = useState<ThroughputPoint[]>([]);
  const [progress, setProgress] = useState(0);
  const [warmingUp, setWarmingUp] = useState(false);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const server = useSyncExternalStore(
    noSubscription,
    serverSnapshot,
    initialServer,
  );
  const rawHistory = useSyncExternalStore(
    subscribeHistory,
    historySnapshot,
    emptySnapshot,
  );
  const history = useMemo(() => parseHistory(rawHistory), [rawHistory]);
  const stats = latencyStats(samples);
  const busy = stages.includes(phase as (typeof stages)[number]);
  const stageIndex = stages.indexOf(phase as (typeof stages)[number]);
  const completed = phase === "complete";

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function runTest() {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("latency");
    setSamples([]);
    setDownload(null);
    setUpload(null);
    setDownloadPoints([]);
    setUploadPoints([]);
    setProgress(0);
    setError("");
    setStorageNotice("");
    setWarmingUp(false);
    const update = (kind: "download" | "upload") => (value: TransferUpdate) => {
      if (controller.signal.aborted) return;
      setProgress(value.progress);
      setWarmingUp(value.warmingUp);
      (kind === "download" ? setDownload : setUpload)(
        value.warmingUp ? null : value.mbps,
      );
      if (!value.warmingUp)
        (kind === "download" ? setDownloadPoints : setUploadPoints)(
          (points) => [...points.slice(-159), value.point],
        );
    };
    try {
      const pings = await measureLatency(controller.signal, (_, values) => {
        setSamples(values);
        setProgress(values.length / PING_COUNT);
      });
      setPhase("download");
      setProgress(0);
      const down = await measureDownload(
        duration * 1000,
        controller.signal,
        update("download"),
      );
      setDownload(down);
      setPhase("upload");
      setProgress(0);
      const up = await measureUpload(
        duration * 1000,
        controller.signal,
        update("upload"),
      );
      setUpload(up);
      setProgress(1);
      setPhase("complete");
      if (
        !saveHistory({
          id: testId(),
          timestamp: Date.now(),
          server: window.location.host,
          duration,
          latency: latencyStats(pings)!,
          download: down,
          upload: up,
        })
      )
        setStorageNotice(
          "This browser could not save the result to local history.",
        );
    } catch (cause) {
      if (controller.signal.aborted) setPhase("cancelled");
      else {
        setPhase("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "The test failed. Please try again.",
        );
      }
    } finally {
      controllerRef.current = null;
      setWarmingUp(false);
    }
  }

  const mainValue =
    phase === "latency"
      ? (stats?.avg ?? null)
      : phase === "upload"
        ? upload
        : download;
  const mainUnit = phase === "latency" ? "ms" : "Mbps";
  const status = completed
    ? "Test complete"
    : phase === "cancelled"
      ? "Test cancelled"
      : phase === "error"
        ? "Connection interrupted"
        : phase === "idle"
          ? "Ready when you are"
          : warmingUp
            ? "Warming up connection"
            : phase === "latency"
              ? `Measuring latency · ${samples.length}/${PING_COUNT}`
              : `Measuring ${phase}`;
  const totalProgress = completed ? 1 : busy ? (stageIndex + progress) / 3 : 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/15 text-violet-400">
            <Icon name="activity" />
          </span>
          speedtest<span className="text-violet-400">.</span>
        </Link>
        <span className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          Browser
          <Icon name="arrow" className="h-3 w-3 shrink-0" />
          server
        </span>
      </header>
      <main>
        <div className="mt-12 text-center sm:mt-16">
          <p className="text-[10px] font-medium tracking-[0.22em] text-violet-400 uppercase">
            A little clarity for your connection
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Know your connection.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
            Latency, download, and upload. One simple test between your browser
            and this server.
          </p>
        </div>
        <section
          aria-label="Network speed test"
          className="mt-8 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 shadow-2xl shadow-black/20 sm:mt-10"
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-4 sm:px-7">
            <h2 className="text-sm font-medium">Connection test</h2>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              Duration
              <select
                aria-label="Duration per speed test"
                value={duration}
                disabled={busy}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 disabled:opacity-50"
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={20}>20 seconds</option>
              </select>
            </label>
          </div>
          <div className="px-5 pt-6 pb-7 sm:px-7">
            <div className="mx-auto flex max-w-xs items-center justify-between gap-2 text-xs text-zinc-500">
              {stages.map((stage, i) => (
                <span
                  key={stage}
                  className={`flex items-center gap-1.5 capitalize transition-colors ${phase === stage ? "text-violet-300" : completed || (busy && stageIndex > i) ? "text-zinc-300" : ""}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${phase === stage ? "border-violet-500 bg-violet-500/15" : "border-zinc-700"}`}
                  >
                    {completed || (busy && stageIndex > i) ? (
                      <Icon name="check" className="h-3 w-3" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {stage}
                </span>
              ))}
            </div>
            <div className="relative mx-auto mt-6 h-56 w-72 max-w-full">
              <svg
                viewBox="0 0 300 240"
                className="h-full w-full"
                aria-hidden="true"
              >
                <path
                  d="M 65 205 A 115 115 0 1 1 235 205"
                  pathLength="100"
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  className="stroke-zinc-800"
                />
                <path
                  d="M 65 205 A 115 115 0 1 1 235 205"
                  pathLength="100"
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(2, totalProgress * 100)} 100`}
                  className={`stroke-violet-400 transition-all duration-300 ${busy ? "drop-shadow-[0_0_8px_rgba(167,139,250,0.45)]" : ""}`}
                />
              </svg>
              <div className="absolute inset-x-0 top-19 text-center">
                <p className="text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
                  {phase === "idle"
                    ? "Let’s find your speed"
                    : phase === "latency"
                      ? "Average latency"
                      : phase === "upload"
                        ? "Upload speed"
                        : "Download speed"}
                </p>
                <div
                  className={`mt-2 font-semibold tracking-tighter tabular-nums ${(mainValue ?? 0) >= 1000 ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl"}`}
                  data-testid="main-result"
                >
                  {formatNumber(mainValue)}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{mainUnit}</p>
              </div>
            </div>
            <div className="-mt-1 text-center">
              <p
                role="status"
                aria-live="polite"
                className={`mb-4 text-xs ${completed ? "text-emerald-400" : "text-zinc-400"}`}
              >
                {busy && (
                  <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                )}
                {status}
              </p>
              <button
                onClick={busy ? () => controllerRef.current?.abort() : runTest}
                className={`inline-flex min-h-11 min-w-44 items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-medium transition-all active:scale-[0.98] ${busy ? "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "bg-violet-500 text-white shadow-lg shadow-violet-500/15 hover:bg-violet-400 hover:shadow-violet-500/25"}`}
              >
                {busy
                  ? "Cancel Test"
                  : phase === "idle"
                    ? "Run Test"
                    : "Run Again"}
                <Icon name={busy ? "stop" : "arrow"} className="h-4 w-4" />
              </button>
              <p className="mt-3 text-[11px] text-zinc-600">
                {busy
                  ? "Keep this tab active for the best measurement."
                  : `About ${duration * 2 + 4} seconds · Uses your network connection`}
              </p>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center text-sm text-red-300"
              >
                {error}
              </p>
            )}
            {completed && (
              <p className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-center text-xs leading-5 text-zinc-300">
                Your connection to this server measured{" "}
                <strong className="text-zinc-100">
                  {formatNumber(download)} Mbps down
                </strong>
                ,{" "}
                <strong className="text-zinc-100">
                  {formatNumber(upload)} Mbps up
                </strong>
                , with{" "}
                <strong className="text-zinc-100">
                  {formatNumber(stats?.avg ?? null)} ms
                </strong>{" "}
                average latency.
              </p>
            )}
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Metric
                icon="activity"
                title="Latency"
                value={stats?.avg ?? null}
                unit="ms"
                active={phase === "latency"}
                complete={
                  completed || phase === "download" || phase === "upload"
                }
              />
              <Metric
                icon="download"
                title="Download"
                value={download}
                unit="Mbps"
                active={phase === "download"}
                complete={completed || phase === "upload"}
              />
              <Metric
                icon="upload"
                title="Upload"
                value={upload}
                unit="Mbps"
                active={phase === "upload"}
                complete={completed}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-y-4 rounded-xl border border-zinc-800/70 px-3 py-4 text-center sm:grid-cols-5">
              {(
                [
                  ["Min", stats?.min],
                  ["Average", stats?.avg],
                  ["Median", stats?.median],
                  ["p95", stats?.p95],
                  ["Jitter", stats?.jitter],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] text-zinc-500">{label}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-300 tabular-nums">
                    {formatNumber(value ?? null)}{" "}
                    <span className="text-[10px] font-normal text-zinc-600">
                      ms
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <ThroughputChart
              download={downloadPoints}
              upload={uploadPoints}
              duration={duration}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 bg-zinc-900/60 px-5 py-3 text-[11px] text-zinc-500 sm:px-7">
            <span className="flex min-w-0 items-center gap-2">
              <Icon name="server" className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-64 truncate">
                Server: <span className="text-zinc-400">{server}</span>
              </span>
            </span>
            <span>25 pings · Parallel transfers</span>
          </div>
        </section>
        <section aria-label="Recent test history" className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Icon name="clock" className="h-4 w-4 text-zinc-500" />
              Recent tests
              <span className="ml-1 text-[10px] font-normal text-zinc-600">
                Saved on this device
              </span>
            </h2>
            {history.length > 0 && (
              <button
                className="min-h-9 px-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                onClick={() => {
                  if (!clearHistory())
                    setStorageNotice(
                      "This browser could not clear local history.",
                    );
                }}
              >
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-5 text-center text-xs text-zinc-600">
              Your last five completed tests will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-normal">Time</th>
                    <th className="px-3 py-3 font-normal">Latency</th>
                    <th className="px-3 py-3 font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="download" className="h-3 w-3 shrink-0" />
                        <span className="sr-only">Download </span>
                        Mbps
                      </span>
                    </th>
                    <th className="px-3 py-3 font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="upload" className="h-3 w-3 shrink-0" />
                        <span className="sr-only">Upload </span>
                        Mbps
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((result) => (
                    <tr
                      key={result.id}
                      className="border-b border-zinc-800/60 text-zinc-300 last:border-0"
                    >
                      <td
                        className="px-4 py-3 whitespace-nowrap text-zinc-500"
                        title={`Server: ${result.server} · ${result.duration}s per transfer`}
                      >
                        {new Date(result.timestamp).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                        {formatNumber(result.latency.avg)}{" "}
                        <span className="text-zinc-600">ms</span>
                      </td>
                      <td className="px-3 py-3 text-violet-300 tabular-nums">
                        {formatNumber(result.download)}
                      </td>
                      <td className="px-3 py-3 text-cyan-300 tabular-nums">
                        {formatNumber(result.upload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {storageNotice && (
            <p role="status" className="mt-2 text-xs text-zinc-500">
              {storageNotice}
            </p>
          )}
        </section>
        <p className="mx-auto mt-7 max-w-xl text-center text-[11px] leading-5 text-zinc-600">
          Results reflect the route to this server and may differ from your
          internet plan. Downloads exclude a short warmup; uploads finish their
          active batches. Jitter is the average difference between consecutive
          pings. Speed tests can use substantial data.
        </p>
      </main>
      <footer className="mt-9 flex items-center justify-between border-t border-zinc-800/60 pt-5 pb-2 text-[10px] text-zinc-600">
        <span>A clearer picture of your network.</span>
        <span>Built for the browser.</span>
      </footer>
    </div>
  );
}
