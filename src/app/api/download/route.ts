import { randomBytes } from "node:crypto";
import { MIB, TRANSFER_HEADERS } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const size = Number(
    new URL(request.url).searchParams.get("size") ?? 100 * MIB,
  );
  if (!Number.isSafeInteger(size) || size < 1 || size > 1024 * MIB) {
    return Response.json(
      { error: "size must be an integer between 1 and 1073741824 bytes." },
      { status: 400, headers: TRANSFER_HEADERS },
    );
  }

  let remaining = size;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (request.signal.aborted || remaining === 0) {
        controller.close();
        return;
      }
      const length = Math.min(64 * 1024, remaining);
      controller.enqueue(randomBytes(length));
      remaining -= length;
    },
    cancel() {
      remaining = 0;
    },
  });

  return new Response(stream, {
    headers: {
      ...TRANSFER_HEADERS,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
    },
  });
}
