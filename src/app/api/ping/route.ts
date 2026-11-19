import { TRANSFER_HEADERS } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { timestamp: Date.now() },
    { headers: TRANSFER_HEADERS },
  );
}
