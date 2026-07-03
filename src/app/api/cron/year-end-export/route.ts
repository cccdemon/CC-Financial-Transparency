import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { maybeRunAutoYearEndExport } from "@/lib/year-end-export";

export const dynamic = "force-dynamic";

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Unattended fiscal-year-end export trigger. Call from a system cron once the
 * fiscal year has ended (e.g. nightly in January):
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://financial.raumdock.org/api/cron/year-end-export
 *
 * Idempotent: only generates a snapshot for a completed year if it is missing.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron disabled" }, { status: 503 });
  }

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer ?? new URL(request.url).searchParams.get("token");
  if (!tokenMatches(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const created = await maybeRunAutoYearEndExport();
  return NextResponse.json({ ok: true, created });
}

export const GET = POST;
