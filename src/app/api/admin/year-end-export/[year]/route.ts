import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { isValidYear } from "@/lib/period";

export async function GET(request: Request, { params }: { params: Promise<{ year: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidYear(year)) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "pdf";
  const record = await db.yearEndExport.findUnique({ where: { year } });
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (format === "csv") {
    return new NextResponse(record.csvData, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="jahresabschluss-${year}.csv"`,
      },
    });
  }

  return new NextResponse(record.pdfData, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="jahresabschluss-${year}.pdf"`,
    },
  });
}
