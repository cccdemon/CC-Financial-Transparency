import Link from "next/link";
import { getPublicYearlySummary, type PublicYearlySummary } from "@/lib/aggregation";
import { currentYear } from "@/lib/period";
import type { IncomeSource } from "@prisma/client";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  twitch_sub: "Subscriptions",
  twitch_resub: "Resubscriptions",
  twitch_gift_sub: "Gift subscriptions",
  twitch_bits: "Bits / cheers",
  twitch_hype_train: "Hype Train",
  manual_twitch_payout: "Twitch payouts",
  manual_ad_revenue: "Ad revenue",
  manual_sponsor: "Sponsorship",
  manual_other: "Other",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  confirmed: "confirmed",
  estimated: "estimated",
  unreviewed: "unreviewed",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function FinancialYearPage() {
  const thisYear = currentYear();
  const lastYear = thisYear - 1;

  const [current, previous] = await Promise.all([
    getPublicYearlySummary(thisYear),
    getPublicYearlySummary(lastYear),
  ]);

  const allSources = new Set<IncomeSource>([
    ...(Object.keys(current.sourceBreakdown) as IncomeSource[]),
    ...(Object.keys(previous.sourceBreakdown) as IncomeSource[]),
  ]);

  const maxMonthly = Math.max(
    1,
    ...current.monthly.map((m) => Math.max(m.income, m.expenses + m.giveaways)),
    ...previous.monthly.map((m) => Math.max(m.income, m.expenses + m.giveaways)),
  );

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="space-y-1">
        <Link href="/financial" className="text-sm text-neutral-500 hover:underline">← Back to current month</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Yearly Overview</h1>
        <p className="text-sm text-neutral-500">
          Side-by-side comparison of {current.year} (year to date) and {previous.year}.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <YearCard summary={current} isCurrent />
        <YearCard summary={previous} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Monthly trend</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <MonthlyTrend summary={current} max={maxMonthly} />
          <MonthlyTrend summary={previous} max={maxMonthly} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Source breakdown</h2>
        {allSources.size === 0 ? (
          <p className="text-sm text-neutral-500">No income recorded in either year.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Source</th>
                <th className="py-2 text-right">{current.year} (YTD)</th>
                <th className="py-2 text-right">{previous.year}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(allSources).map((source) => (
                <tr key={source} className="border-b last:border-0">
                  <td className="py-2">{SOURCE_LABELS[source] ?? source}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(current.sourceBreakdown[source] ?? 0, current.currency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(previous.sourceBreakdown[source] ?? 0, previous.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        Year-to-date values include all months up to today. Yearly totals reflect publicly visible
        ledger rows only and may include estimated entries.
      </p>
    </main>
  );
}

function YearCard({ summary, isCurrent }: { summary: PublicYearlySummary; isCurrent?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold">
          {summary.year}
          {isCurrent && summary.isPartial && (
            <span className="ml-2 text-xs font-normal text-neutral-500">year to date</span>
          )}
        </h3>
        <span className="inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
          {CONFIDENCE_LABEL[summary.confidence]}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">Income</dt>
        <dd className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(summary.income, summary.currency)}
        </dd>
        <dt className="text-neutral-500">Expenses</dt>
        <dd className="text-right tabular-nums">{formatCurrency(summary.expenses, summary.currency)}</dd>
        <dt className="text-neutral-500">Giveaways</dt>
        <dd className="text-right tabular-nums">{formatCurrency(summary.giveaways, summary.currency)}</dd>
        <dt className="border-t border-neutral-200 pt-2 font-medium dark:border-neutral-800">Net</dt>
        <dd
          className={`border-t border-neutral-200 pt-2 text-right tabular-nums font-medium dark:border-neutral-800 ${
            summary.netResult >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {formatCurrency(summary.netResult, summary.currency)}
        </dd>
      </dl>
    </div>
  );
}

function MonthlyTrend({ summary, max }: { summary: PublicYearlySummary; max: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="mb-3 text-sm font-medium">{summary.year}</h3>
      <div className="flex h-32 items-end gap-1">
        {summary.monthly.map((m, idx) => {
          const incomeH = (m.income / max) * 100;
          const costsH = ((m.expenses + m.giveaways) / max) * 100;
          return (
            <div key={m.period} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="flex min-h-0 w-full flex-1 items-end gap-0.5">
                <div
                  className="min-h-px flex-1 bg-emerald-500/70 dark:bg-emerald-400/70"
                  style={{ height: `${incomeH}%` }}
                  title={`Income ${formatCurrency(m.income, summary.currency)}`}
                />
                <div
                  className="min-h-px flex-1 bg-rose-500/70 dark:bg-rose-400/70"
                  style={{ height: `${costsH}%` }}
                  title={`Costs ${formatCurrency(m.expenses + m.giveaways, summary.currency)}`}
                />
              </div>
              <span className="text-[10px] text-neutral-500">{MONTH_LABELS[idx]}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-emerald-500/70" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-rose-500/70" /> Expenses + Giveaways
        </span>
      </div>
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
