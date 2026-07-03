import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { currentYear, isValidYear } from "@/lib/period";
import { getProfitLossReport } from "@/lib/profit-loss";
import { buildProfitLossPdf } from "@/lib/profit-loss-pdf";

export async function GET(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year") ?? currentYear());
  const year = isValidYear(requestedYear) ? requestedYear : currentYear();
  const report = await getProfitLossReport(year);
  const pdfBytes = await buildProfitLossPdf(report);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="gewinn-verlust-${year}.pdf"`,
    },
  });
}
