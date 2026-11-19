import { describe, expect, test } from "bun:test";
import { GET as ping } from "@/app/api/ping/route";
import { GET as download } from "@/app/api/download/route";
import { POST as upload } from "@/app/api/upload/route";
import { MAX_UPLOAD_BYTES } from "@/lib/http";

describe("measurement endpoints", () => {
  test("ping returns a fresh timestamp with caching disabled", async () => {
    const before = Date.now();
    const response = ping();
    expect((await response.json()).timestamp).toBeGreaterThanOrEqual(before);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  test("download emits the exact requested number of random, uncompressed bytes", async () => {
    const response = download(
      new Request("http://localhost/api/download?size=150001"),
    );
    expect(response.headers.get("content-length")).toBe("150001");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-transform");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(150001);
    expect(new Set(bytes).size).toBeGreaterThan(200);
  });
  test("download rejects invalid sizes and permits cancelling large streams", async () => {
    for (const size of ["0", "-1", "NaN", "1.5", "1073741825"]) {
      expect(
        download(new Request(`http://localhost/api/download?size=${size}`))
          .status,
      ).toBe(400);
    }
    const response = download(new Request("http://localhost/api/download"));
    expect(response.headers.get("content-length")).toBe("104857600");
    const reader = response.body!.getReader();
    expect((await reader.read()).value!.length).toBe(65536);
    await reader.cancel();
    expect((await reader.read()).done).toBe(true);
  });
  test("upload counts a multi-chunk request incrementally", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65536));
        controller.enqueue(new Uint8Array(17));
        controller.close();
      },
    });
    const response = await upload(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    );
    const result = await response.json();
    expect(result.bytes).toBe(65553);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
  test("empty uploads work and oversized uploads are rejected with and without content-length", async () => {
    expect(
      (
        await (
          await upload(
            new Request("http://localhost/api/upload", { method: "POST" }),
          )
        ).json()
      ).bytes,
    ).toBe(0);
    expect(
      (
        await upload(
          new Request("http://localhost/api/upload", {
            method: "POST",
            headers: { "Content-Length": String(MAX_UPLOAD_BYTES + 1) },
          }),
        )
      ).status,
    ).toBe(413);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        sent++;
        if (sent > 65) controller.close();
      },
    });
    expect(
      (
        await upload(
          new Request("http://localhost/api/upload", {
            method: "POST",
            body,
            duplex: "half",
          } as RequestInit),
        )
      ).status,
    ).toBe(413);
  });
});
