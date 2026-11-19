import type { ThroughputPoint } from "@/lib/speedtest";
export function ThroughputChart({
  download,
  upload,
  duration,
}: {
  download: ThroughputPoint[];
  upload: ThroughputPoint[];
  duration: number;
}) {
  const maximum = Math.max(
    10,
    ...download.map((p) => p.mbps),
    ...upload.map((p) => p.mbps),
  );
  const seconds = Math.max(
    duration,
    ...download.map((p) => p.seconds),
    ...upload.map((p) => p.seconds),
  );
  const path = (points: ThroughputPoint[]) =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${(p.seconds / seconds) * 600} ${110 - (p.mbps / maximum) * 100}`,
      )
      .join(" ");
  const hasData = download.length > 0 || upload.length > 0;
  return (
    <div className="relative mt-6 border-t border-zinc-800/80 pt-5">
      <div className="mb-4 flex items-center justify-between text-xs">
        <h3 className="font-medium text-zinc-400">Throughput over time</h3>
        <div className="flex gap-4 text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Download
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Upload
          </span>
        </div>
      </div>
      <div className="relative pl-11">
        <span className="absolute top-0 left-0 text-[10px] text-zinc-600">
          {Math.ceil(maximum)}
        </span>
        <span className="absolute bottom-5 left-0 text-[10px] text-zinc-600">
          0 Mbps
        </span>
        <svg
          className="h-28 w-full overflow-visible"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          role="img"
          aria-label={
            hasData
              ? "Live download and upload throughput in megabits per second"
              : "Throughput chart will appear when you run a test"
          }
        >
          {[10, 60, 110].map((y) => (
            <line
              key={y}
              x1="0"
              x2="600"
              y1={y}
              y2={y}
              className="stroke-zinc-800"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {download.length > 0 && (
            <path
              d={path(download)}
              fill="none"
              className="stroke-violet-400"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {upload.length > 0 && (
            <path
              d={path(upload)}
              fill="none"
              className="stroke-cyan-400"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {!hasData && (
          <p className="absolute inset-0 flex items-center justify-center pt-3 text-xs text-zinc-600">
            Your connection, in real time.
          </p>
        )}
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>0s</span>
          <span>{Math.ceil(seconds / 2)}s</span>
          <span>{Math.ceil(seconds)}s</span>
        </div>
      </div>
    </div>
  );
}
