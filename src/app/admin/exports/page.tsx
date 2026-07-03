import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest } from "@/lib/security";
import { currentYear, isValidYear } from "@/lib/period";
import { generateYearEndExport, maybeRunAutoYearEndExport } from "@/lib/year-end-export";

export const dynamic = "force-dynamic";

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

export default async function ExportsPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  // Automatic fiscal-year-end export: freezes last year's snapshot on first
  // visit after the year has ended (mirrors the cron endpoint).
  await maybeRunAutoYearEndExport();

  async function generate(formData: FormData) {
    "use server";
    await assertSameOriginRequest();
    if (!(await getAdminSession())) redirect("/admin/login");
    const year = Number(formData.get("year"));
    if (!isValidYear(year)) throw new Error("Invalid year");
    await generateYearEndExport(year, { auto: false });
    redirect("/admin/exports");
  }

  const exports = await db.yearEndExport.findMany({ orderBy: { year: "desc" } });
  const thisYear = currentYear();
  const yearOptions = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Jahresabschlüsse / Exporte</h1>
        <p className="text-sm text-neutral-500">
          Eingefrorene Gewinn- und Verlustrechnung pro Geschäftsjahr (PDF + CSV). Abgeschlossene
          Jahre werden automatisch erzeugt; hier kannst du sie neu erzeugen oder manuell anstoßen.
        </p>
      </div>

      <form action={generate} className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Geschäftsjahr</span>
          <select name="year" defaultValue={thisYear - 1} className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Jetzt erzeugen / aktualisieren
        </button>
        <p className="text-xs text-neutral-500">
          Erzeugt einen neuen Snapshot aus den aktuellen Ledger-Daten und überschreibt einen
          vorhandenen Snapshot desselben Jahres.
        </p>
      </form>

      {exports.length === 0 ? (
        <p className="text-sm text-neutral-600">Noch keine Jahresabschlüsse gespeichert.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
              <th className="py-2">Jahr</th>
              <th className="py-2 text-right">Einnahmen</th>
              <th className="py-2 text-right">Ausgaben</th>
              <th className="py-2 text-right">Ergebnis</th>
              <th className="py-2">Erzeugt</th>
              <th className="py-2">Quelle</th>
              <th className="py-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {exports.map((row) => (
              <tr key={row.year} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-1.5 font-medium">{row.year}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(row.incomeTotal), row.currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(row.expenseTotal), row.currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(row.profit), row.currency)}</td>
                <td className="py-1.5 tabular-nums">{new Date(row.generatedAt).toLocaleString("de-DE")}</td>
                <td className="py-1.5">
                  <span className={`rounded px-2 py-0.5 text-xs ${row.auto ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                    {row.auto ? "automatisch" : "manuell"}
                  </span>
                </td>
                <td className="py-1.5">
                  <div className="flex gap-3">
                    <a href={`/api/admin/year-end-export/${row.year}?format=pdf`} className="text-blue-600 hover:underline">PDF</a>
                    <a href={`/api/admin/year-end-export/${row.year}?format=csv`} className="text-blue-600 hover:underline">CSV</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-xs text-neutral-500">
        Hinweis: Diese Snapshots sind technische Auswertungen der erfassten Ledger-Daten und ersetzen
        keine Steuerberatung.
      </p>
    </div>
  );
}
