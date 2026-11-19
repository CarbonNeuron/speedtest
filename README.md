# Speedtest

A dark, responsive network speed test built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and Inter through `next/font`. It measures the connection from the browser to the server serving this app.

## Run locally

Requires Bun 1.4.3+ and Node.js 22+.

```bash
export PATH=$HOME/.bun/bin:$PATH
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. For production:

```bash
bun run build
bun run start
```

This is a **server-backed app**. The build lives in `.next/` and runs with `next start`; there is no static export. All three measurement endpoints execute on the Node.js server.

## Measurements

The Run Test button runs latency → download → upload. Transfers default to 10 seconds each; the selector also offers 5 and 20 seconds. Live statistics, a progress gauge, and a throughput graph update during the test. Cancel stops active requests, and only completed runs enter the five-result local history.

- **Latency:** one connection warmup, then 25 sequential HTTP round trips, spaced by 70 ms. Timing includes receiving and parsing the ping response. Shows minimum, arithmetic mean, median, nearest-rank p95, and jitter (mean absolute difference between consecutive pings). These are HTTP timings, not ICMP pings.
- **Download:** four concurrent streams of cryptographically random bytes, requesting another 100 MiB when a stream finishes. A 750 ms warmup is excluded from the measured average. The browser counts bytes as it reads them, then stops all streams at the selected deadline.
- **Upload:** one 256 KiB connection warmup, then two parallel uploads. Batch size adapts between 16 KiB and 16 MiB, targeting roughly half-second requests. Live estimates use browser upload progress; the final average uses server-confirmed bytes and total wall-clock time. Active batches finish after the selected deadline, so the upload phase can take a little longer. Each request has a 15-second timeout.
- **Graph:** updates approximately every 250 ms. Upload samples use a rolling second to smooth browser progress events. Large result numbers show the overall average during the phase.

Tests may use substantial data. Results depend on the path to this server, server capacity, browser performance, concurrent traffic, and any proxies. They are not a measurement of your advertised internet plan. Keep the tab active while testing. Local history stays in the browser; no account or database is required.

## API

| Endpoint                           | Behavior                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/ping`                    | Small JSON response: `{ timestamp }`, in Unix milliseconds.                                                                                                                     |
| `GET /api/download?size=104857600` | Streams random bytes. Size defaults to 100 MiB; accepts integer byte counts from 1 byte to 1 GiB. Invalid sizes return 400.                                                     |
| `POST /api/upload`                 | Reads the body incrementally without retaining it. Returns `{ bytes, durationMs }`. A 64 MiB limit is enforced both with and without Content-Length; larger uploads return 413. |

API responses disable caching and transformations. Next.js compression is disabled so downloaded byte counts represent transferred payload rather than compressed content.

```bash
curl -i http://localhost:3000/api/ping
curl -sS -D /tmp/speedtest-download.headers \
  'http://localhost:3000/api/download?size=1048576' \
  -o /tmp/speedtest-download.bin
wc -c /tmp/speedtest-download.bin
curl -sS -X POST -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/speedtest-download.bin \
  http://localhost:3000/api/upload
```

## Docker

```bash
docker compose up --build -d
```

The multi-stage image uses Bun for installation and scripts, with Node.js 22 running Next.js. The app runs as a non-root user, listens on port **3000** inside the container, and includes a ping health check. Compose maps host port 3000 and restarts the app unless stopped.

If deploying behind a reverse proxy, disable request/response buffering, caching, and compression for `/api/*`. Allow request bodies up to 64 MiB and timeouts longer than the test duration. These settings keep proxy behavior from distorting measurements. No persistent server volume or environment secrets are required.

## Verification

```bash
export PATH=$HOME/.bun/bin:$PATH
bun run format && bun run format:check
bun run lint
bun run test
bun run build
bun run start
```

For the production browser tests, in another terminal:

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright reuses an existing local production server or starts one from `.next/`. Desktop and mobile tests cover the full test sequence, positive results, history persistence and clearing, cancellation and restart, errors, and responsive layout. Screenshots and failure traces are written to ignored `test-results/`.
