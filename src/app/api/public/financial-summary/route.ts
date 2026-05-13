import { NextResponse } from "next/server";
import { getPublicMonthlySummary } from "@/lib/aggregation";
import { currentMonthPeriod, isValidPeriod } from "@/lib/period";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? currentMonthPeriod();

  if (!isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid period; expected YYYY-MM." }, { status: 400 });
  }

  const summary = await getPublicMonthlySummary(period);

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "public, max-age=15, s-maxage=15",
      "X-Robots-Tag": "noindex",
    },
  });
}
