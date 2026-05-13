import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { currentYear, isValidYear } from "@/lib/period";
import { getProfitLossReport, type ProfitLossLine } from "@/lib/profit-loss";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function ProfitLossPage({ searchParams }: PageProps) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const sp = await searchParams;
  const requestedYear = Number(sp.year ?? currentYear());
  const year = isValidYear(requestedYear) ? requestedYear : currentYear();
  const report = await getProfitLossReport(year);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gewinn-/Verlustrechnung</h1>
          <p className="text-sm text-neutral-500">Jahresübersicht für Einkommensteuer / EÜR-Vorbereitung.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/admin/profit-loss?year=${year - 1}`} className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
            {year - 1}
          </Link>
          <Link href={`/admin/profit-loss?year=${year + 1}`} className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
            {year + 1}
          </Link>
          <a href={`/api/admin/profit-loss.csv?year=${year}`} className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
            CSV
          </a>
          <button onClick={undefined} className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Druck über Browser
          </button>
        </div>
      </div>

      <article className="rounded border border-neutral-200 bg-white p-6 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-white print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-4">
          <h2 className="text-2xl font-semibold">Gewinn-/Verlustrechnung {report.year}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Erstellt am {new Date(report.generatedAt).toLocaleDateString("de-DE")}
          </p>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-4 text-sm">
          <Summary label="Betriebseinnahmen" value={report.incomeTotal} currency={report.currency} />
          <Summary label="Betriebsausgaben" value={report.expenseTotal} currency={report.currency} />
          <Summary label={report.profit >= 0 ? "Gewinn" : "Verlust"} value={report.profit} currency={report.currency} />
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-lg font-medium">Monatsübersicht</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-2">Monat</th>
                <th className="py-2 text-right">Einnahmen</th>
                <th className="py-2 text-right">Ausgaben</th>
                <th className="py-2 text-right">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map((row) => (
                <tr key={row.period} className="border-b border-neutral-200">
                  <td className="py-1.5">{row.period}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.income, report.currency)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.expenses, report.currency)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.profit, report.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <LineTable title="Betriebseinnahmen" rows={report.incomeLines} currency={report.currency} />
        <LineTable title="Betriebsausgaben" rows={report.expenseLines} currency={report.currency} />

        <p className="mt-6 text-xs text-neutral-600">
          Hinweis: Diese Übersicht ist eine technische Auswertung der erfassten Ledger-Daten und ersetzt keine Steuerberatung.
          Bitte Belege und steuerliche Einordnung prüfen.
        </p>
      </article>
    </div>
  );
}

function Summary({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="border border-neutral-300 p-3">
      <div className="text-xs uppercase text-neutral-600">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(value, currency)}</div>
    </div>
  );
}

function LineTable({ title, rows, currency }: { title: string; rows: ProfitLossLine[]; currency: string }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-lg font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600">Keine Einträge.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="py-2">Datum</th>
              <th className="py-2">Kategorie</th>
              <th className="py-2">Beschreibung</th>
              <th className="py-2 text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.date}-${row.description}-${index}`} className="border-b border-neutral-200">
                <td className="py-1.5 tabular-nums">{row.date}</td>
                <td className="py-1.5">{row.category}</td>
                <td className="py-1.5">{row.description}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.amount, row.currency || currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
