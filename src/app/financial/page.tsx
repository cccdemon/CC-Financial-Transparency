import Link from "next/link";
import { getPublicMonthlySummary } from "@/lib/aggregation";
import { currentMonthPeriod } from "@/lib/period";

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

export default async function FinancialPage() {
  const period = currentMonthPeriod();
  const summary = await getPublicMonthlySummary(period);

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Stream Financial Transparency</h1>
        <p className="text-sm text-neutral-500">
          Period: <strong>{summary.period}</strong> · Last update {new Date(summary.updatedAt).toLocaleString()} ·{" "}
          <span className="inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
            {CONFIDENCE_LABEL[summary.confidence]}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Income" value={summary.income} currency={summary.currency} tone="positive" />
        <Card label="Giveaways" value={summary.giveaways} currency={summary.currency} />
        <Card label="Costs" value={summary.expenses} currency={summary.currency} />
        <Card label="Net" value={summary.netResult} currency={summary.currency} tone={summary.netResult >= 0 ? "positive" : "negative"} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Source breakdown</h2>
        {Object.keys(summary.sourceBreakdown).length === 0 ? (
          <p className="text-sm text-neutral-500">No income recorded yet this month.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.sourceBreakdown).map(([source, amount]) => (
                <tr key={source} className="border-b last:border-0">
                  <td className="py-2">{SOURCE_LABELS[source] ?? source}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(amount, summary.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        Values are estimates derived from Twitch signals and manually-entered ledger rows. Final payout
        amounts are confirmed during monthly review. See{" "}
        <Link href="/financial/year" className="underline">yearly overview</Link> or{" "}
        <Link href="/financial/giveaways" className="underline">giveaways</Link>.
      </p>
    </main>
  );
}

function Card({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-rose-600 dark:text-rose-400"
      : "text-neutral-900 dark:text-neutral-100";

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
