import { MIB } from "@/lib/http";
import { testId } from "@/lib/id";
import { toMbps } from "@/lib/metrics";

export const PING_COUNT = 25;
export const WARMUP_MS = 750;
export type ThroughputPoint = { seconds: number; mbps: number };
export type TransferUpdate = {
  mbps: number;
  progress: number;
  point: ThroughputPoint;
  warmingUp: boolean;
};

function aborted() {
  return new DOMException("Test cancelled", "AbortError");
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function transferController(signal: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  return {
    controller,
    cleanup: () => {
      controller.abort();
      signal.removeEventListener("abort", cancel);
    },
  };
}

export async function measureLatency(
  signal: AbortSignal,
  onSample: (sample: number, samples: number[]) => void,
) {
  const samples: number[] = [];
  // Establish the connection before measuring HTTP round-trip latency.
  for (let i = -1; i < PING_COUNT; i++) {
    signal.throwIfAborted();
    const started = performance.now();
    const response = await fetch(`/api/ping?nonce=${testId()}`, {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) throw new Error("The latency endpoint did not respond.");
    const data = await response.json();
    if (typeof data.timestamp !== "number")
      throw new Error("Invalid ping response.");
    if (i >= 0) {
      const sample = performance.now() - started;
      samples.push(sample);
      onSample(sample, [...samples]);
    }
    if (i < PING_COUNT - 1) await pause(70, signal);
  }
  return samples;
}

export async function measureDownload(
  durationMs: number,
  signal: AbortSignal,
  onUpdate: (update: TransferUpdate) => void,
) {
  const { controller, cleanup } = transferController(signal);
  let bytes = 0;
  let result = 0;
  let deadlineReached = false;

  const worker = async () => {
    try {
      while (!controller.signal.aborted) {
        const response = await fetch(`/api/download?nonce=${testId()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error("The download endpoint did not respond.");
        const reader = response.body.getReader();
        try {
          while (!controller.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  };

  const monitor = async () => {
    onUpdate({
      mbps: 0,
      progress: 0,
      point: { seconds: 0, mbps: 0 },
      warmingUp: true,
    });
    await pause(WARMUP_MS, controller.signal);
    const initialBytes = bytes;
    const started = performance.now();
    let previousBytes = bytes;
    let previousTime = started;
    while (performance.now() - started < durationMs) {
      await pause(
        Math.min(250, durationMs - (performance.now() - started)),
        controller.signal,
      );
      const now = performance.now();
      const elapsed = now - started;
      result = toMbps(bytes - initialBytes, elapsed);
      onUpdate({
        mbps: result,
        progress: Math.min(elapsed / durationMs, 1),
        point: {
          seconds: elapsed / 1000,
          mbps: toMbps(bytes - previousBytes, now - previousTime),
        },
        warmingUp: false,
      });
      previousBytes = bytes;
      previousTime = now;
    }
    deadlineReached = true;
    controller.abort();
  };

  try {
    await Promise.all([monitor(), worker(), worker(), worker(), worker()]);
    signal.throwIfAborted();
    if (!deadlineReached || bytes === 0)
      throw new Error("No download data received.");
    return result;
  } finally {
    cleanup();
  }
}

function randomPayload() {
  const buffer = new Uint8Array(16 * MIB);
  for (let offset = 0; offset < buffer.length; offset += 65536) {
    crypto.getRandomValues(buffer.subarray(offset, offset + 65536));
  }
  return buffer;
}

function upload(
  payload: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
) {
  return new Promise<number>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const finish = (error?: Error, bytes?: number) => {
      signal.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve(bytes!);
    };
    xhr.open("POST", `/api/upload?nonce=${testId()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.timeout = 15000;
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onerror = () => finish(new Error("The upload connection failed."));
    xhr.ontimeout = () =>
      finish(
        new Error(
          "The upload timed out. Try a longer test or a faster connection.",
        ),
      );
    xhr.onabort = () => finish(aborted());
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status !== 200 || response.bytes !== payload.byteLength) {
          throw new Error("The server did not receive the full upload.");
        }
        finish(undefined, response.bytes);
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Invalid upload response."),
        );
      }
    };
    signal.addEventListener("abort", cancel, { once: true });
    xhr.send(payload);
  });
}

export async function measureUpload(
  durationMs: number,
  signal: AbortSignal,
  onUpdate: (update: TransferUpdate) => void,
) {
  const { controller, cleanup } = transferController(signal);
  const payload = randomPayload();
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    onUpdate({
      mbps: 0,
      progress: 0,
      point: { seconds: 0, mbps: 0 },
      warmingUp: true,
    });
    const warmupStarted = performance.now();
    await upload(payload.subarray(0, 256 * 1024), controller.signal, () => {});
    const initialSize = Math.max(
      16 * 1024,
      Math.min(
        16 * MIB,
        Math.round(
          (256 * 1024 * 500) / Math.max(1, performance.now() - warmupStarted),
        ),
      ),
    );
    const started = performance.now();
    let confirmedBytes = 0;
    const inFlightBytes = [0, 0];
    const recent = [{ bytes: 0, time: started }];

    const emit = (final = false) => {
      const now = performance.now();
      const elapsed = now - started;
      const bytes = confirmedBytes + inFlightBytes[0] + inFlightBytes[1];
      recent.push({ bytes, time: now });
      while (recent.length > 2 && recent[1].time < now - 1000) recent.shift();
      onUpdate({
        mbps: toMbps(bytes, elapsed),
        progress: Math.min(elapsed / durationMs, final ? 1 : 0.99),
        point: {
          seconds: elapsed / 1000,
          // A rolling second smooths batched browser upload-progress events.
          mbps: toMbps(
            Math.max(0, bytes - recent[0].bytes),
            now - recent[0].time,
          ),
        },
        warmingUp: false,
      });
    };
    timer = setInterval(emit, 250);

    const worker = async (index: number) => {
      let size = initialSize;
      while (performance.now() - started < durationMs) {
        const requestStarted = performance.now();
        const received = await upload(
          payload.subarray(0, size),
          controller.signal,
          (loaded) => {
            inFlightBytes[index] = loaded;
          },
        );
        confirmedBytes += received;
        inFlightBytes[index] = 0;
        // Aim for half-second batches so slow links don't end with a long tail.
        size = Math.max(
          16 * 1024,
          Math.min(
            16 * MIB,
            Math.round(
              (size * 500) / Math.max(1, performance.now() - requestStarted),
            ),
          ),
        );
      }
    };
    await Promise.all([worker(0), worker(1)]);
    signal.throwIfAborted();
    emit(true);
    return toMbps(confirmedBytes, performance.now() - started);
  } finally {
    clearInterval(timer);
    cleanup();
  }
}
