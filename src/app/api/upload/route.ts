import { MAX_UPLOAD_BYTES, TRANSFER_HEADERS } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: TRANSFER_HEADERS });
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_UPLOAD_BYTES) {
    return respond({ error: "Upload exceeds the 64 MiB limit." }, 413);
  }
  if (!request.body) return respond({ bytes: 0, durationMs: 0 });

  const started = performance.now();
  const reader = request.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        return respond({ error: "Upload exceeds the 64 MiB limit." }, 413);
      }
    }
    return respond({ bytes, durationMs: performance.now() - started });
  } catch {
    return respond({ error: "The upload stream was interrupted." }, 400);
  } finally {
    reader.releaseLock();
  }
}
