import { db } from "@/lib/db";
import { getProfitLossReport, type ProfitLossReport } from "@/lib/profit-loss";
import { buildProfitLossPdf } from "@/lib/profit-loss-pdf";
import { csvSafeCell } from "@/lib/security";
import { currentYear, isValidYear } from "@/lib/period";

export function buildProfitLossCsv(report: ProfitLossReport): string {
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
  return rows.map((row) => row.map(csvSafeCell).join(",")).join("\n");
}

/**
 * Build the frozen year-end snapshot (PDF + CSV) for a fiscal year and store it
 * in the database (upsert). Returns the persisted record.
 */
export async function generateYearEndExport(year: number, options: { auto?: boolean } = {}) {
  if (!isValidYear(year)) {
    throw new Error(`Invalid year: ${year}`);
  }
  const report = await getProfitLossReport(year);
  const pdfBytes = await buildProfitLossPdf(report);
  const csv = buildProfitLossCsv(report);

  const data = {
    year,
    currency: report.currency,
    incomeTotal: report.incomeTotal,
    expenseTotal: report.expenseTotal,
    profit: report.profit,
    pdfData: Buffer.from(pdfBytes),
    csvData: Buffer.from(csv, "utf8"),
    auto: options.auto ?? false,
    generatedAt: new Date(),
  };

  return db.yearEndExport.upsert({
    where: { year },
    create: data,
    update: data,
  });
}

/**
 * Automatic fiscal-year-end export. The fiscal year equals the calendar year.
 * Once a year is complete (i.e. `now` is in a later year), its snapshot is
 * frozen if it does not exist yet. Returns the list of years that were created.
 *
 * Safe to call repeatedly (e.g. on admin page load or via cron) — it only
 * generates a snapshot when one is missing, so it never overwrites a frozen
 * report. Manual regeneration must use `generateYearEndExport` directly.
 */
export async function maybeRunAutoYearEndExport(now = new Date()): Promise<number[]> {
  const completedYear = currentYear(now) - 1;
  if (!isValidYear(completedYear)) return [];

  const existing = await db.yearEndExport.findUnique({ where: { year: completedYear } });
  if (existing) return [];

  await generateYearEndExport(completedYear, { auto: true });
  return [completedYear];
}
