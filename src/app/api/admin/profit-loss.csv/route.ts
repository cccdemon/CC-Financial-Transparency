import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { currentYear, isValidYear } from "@/lib/period";
import { getProfitLossReport } from "@/lib/profit-loss";

export async function GET(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year") ?? currentYear());
  const year = isValidYear(requestedYear) ? requestedYear : currentYear();
  const report = await getProfitLossReport(year);

  const rows = [
    ["section", "date", "category", "description", "amount", "currency"],
    ["summary", "", "Betriebseinnahmen", "", report.incomeTotal.toFixed(2), report.currency],
    ["summary", "", "Betriebsausgaben", "", report.expenseTotal.toFixed(2), report.currency],
    ["summary", "", report.profit >= 0 ? "Gewinn" : "Verlust", "", report.profit.toFixed(2), report.currency],
    ...report.incomeLines.map((line) => [
      "income",
      line.date,
      line.category,
      line.description,
      line.amount.toFixed(2),
      line.currency,
    ]),
    ...report.expenseLines.map((line) => [
      "expense",
      line.date,
      line.category,
      line.description,
      line.amount.toFixed(2),
      line.currency,
    ]),
  ];

  return new NextResponse(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gewinn-verlust-${year}.csv"`,
    },
  });
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
