import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { currentMonthPeriod } from "@/lib/period";
import { recurringInstancesForPeriod } from "@/lib/recurring-expenses";

export const dynamic = "force-dynamic";

const ZERO = new Prisma.Decimal(0);

export default async function AdminMonthsPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  const [incomeRows, expenseRows, giveawayRows, recurringRules] = await Promise.all([
    db.incomeEvent.findMany({
      select: { occurredAt: true, grossAmount: true, netAmount: true, currency: true },
      orderBy: { occurredAt: "desc" },
    }),
    db.expenseEvent.findMany({
      select: { occurredAt: true, amount: true, currency: true },
      orderBy: { occurredAt: "desc" },
    }),
    db.giveaway.findMany({
      select: { occurredAt: true, actualCost: true, estimatedValue: true, currency: true },
      orderBy: { occurredAt: "desc" },
    }),
    db.recurringExpense.findMany(),
  ]);

  const months = new Map<string, {
    income: Prisma.Decimal;
    expenses: Prisma.Decimal;
    giveaways: Prisma.Decimal;
    currencies: Set<string>;
    entries: number;
  }>();

  for (const row of incomeRows) {
    const month = monthKey(row.occurredAt);
    const current = ensureMonth(months, month);
    current.income = current.income.add(row.netAmount ?? row.grossAmount);
    current.currencies.add(row.currency);
    current.entries += 1;
  }
  for (const row of expenseRows) {
    const month = monthKey(row.occurredAt);
    const current = ensureMonth(months, month);
    current.expenses = current.expenses.add(row.amount);
    current.currencies.add(row.currency);
    current.entries += 1;
  }
  for (const row of giveawayRows) {
    const month = monthKey(row.occurredAt);
    const current = ensureMonth(months, month);
    current.giveaways = current.giveaways.add(row.actualCost ?? row.estimatedValue ?? ZERO);
    current.currencies.add(row.currency);
    current.entries += 1;
  }
  const latestPeriod = currentMonthPeriod();
  for (const period of recurringPeriods(recurringRules, latestPeriod)) {
    const current = ensureMonth(months, period);
    for (const recurring of recurringInstancesForPeriod(recurringRules, period)) {
      current.expenses = current.expenses.add(recurring.amount);
      current.currencies.add(recurring.currency);
      current.entries += 1;
    }
  }

  const rows = [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, totals]) => ({
      period,
      income: totals.income.toNumber(),
      expenses: totals.expenses.toNumber(),
      giveaways: totals.giveaways.toNumber(),
      net: totals.income.sub(totals.expenses).toNumber(),
      currency: totals.currencies.size === 1 ? [...totals.currencies][0] : null,
      entries: totals.entries,
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Months</h1>
        <Link href="/admin/income/import/twitch-payments" className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700">
          Import Twitch payments
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No ledger rows recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Month</th>
              <th className="py-2 text-right">Income</th>
              <th className="py-2 text-right">Expenses</th>
              <th className="py-2 text-right">Giveaways</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2 text-right">Entries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period} className="border-b last:border-0">
                <td className="py-2">
                  <Link href={`/admin/months/${row.period}`} className="font-medium hover:underline">
                    {row.period}
                  </Link>
                </td>
                <td className="py-2 text-right tabular-nums">{formatAmount(row.income, row.currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(row.expenses, row.currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(row.giveaways, row.currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(row.net, row.currency)}</td>
                <td className="py-2 text-right tabular-nums">{row.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ensureMonth(
  months: Map<string, { income: Prisma.Decimal; expenses: Prisma.Decimal; giveaways: Prisma.Decimal; currencies: Set<string>; entries: number }>,
  month: string,
) {
  const existing = months.get(month);
  if (existing) return existing;
  const created = { income: ZERO, expenses: ZERO, giveaways: ZERO, currencies: new Set<string>(), entries: 0 };
  months.set(month, created);
  return created;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function recurringPeriods(
  rules: Array<{ startMonth: string; endMonth: string | null }>,
  latestPeriod: string,
): string[] {
  const periods = new Set<string>();
  for (const rule of rules) {
    let period = rule.startMonth;
    const end = rule.endMonth && rule.endMonth < latestPeriod ? rule.endMonth : latestPeriod;
    while (period <= end) {
      periods.add(period);
      period = shiftPeriod(period, 1);
    }
  }
  return [...periods];
}

function shiftPeriod(period: string, deltaMonths: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatAmount(value: number, currency: string | null): string {
  if (!currency) return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
