import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { isValidPeriod, periodBounds } from "@/lib/period";

export const dynamic = "force-dynamic";

export default async function AdminMonthPage({ params }: { params: Promise<{ period: string }> }) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { period } = await params;
  if (!isValidPeriod(period)) notFound();

  const { start, end } = periodBounds(period);
  const [incomeRows, expenseRows, giveawayRows] = await Promise.all([
    db.incomeEvent.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
    db.expenseEvent.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
    db.giveaway.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const income = incomeRows.reduce((acc, row) => acc + Number(row.netAmount ?? row.grossAmount), 0);
  const expenses = expenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const giveaways = giveawayRows.reduce((acc, row) => acc + Number(row.actualCost ?? row.estimatedValue ?? 0), 0);
  const returnTo = `/admin/months/${period}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/months" className="text-sm text-neutral-500 hover:underline">
          Back to months
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Month {period}</h1>
          <div className="flex gap-2 text-sm">
            <Link href={`/admin/months/${shiftPeriod(period, -1)}`} className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
              Previous
            </Link>
            <Link href={`/admin/months/${shiftPeriod(period, 1)}`} className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
              Next
            </Link>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat label="Income" value={income} />
        <Stat label="Expenses" value={expenses} />
        <Stat label="Giveaways" value={giveaways} />
        <Stat label="Net" value={income - expenses} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Income</h2>
          <Link href="/admin/income/new" className="text-sm text-neutral-500 hover:underline">New income</Link>
        </div>
        {incomeRows.length === 0 ? (
          <p className="text-sm text-neutral-500">No income entries in this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 tabular-nums">{formatDate(row.occurredAt)}</td>
                  <td className="py-2">{row.source}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.netAmount ?? row.grossAmount), row.currency)}</td>
                  <td className="py-2">{row.confidence}{row.public ? "" : " / private"}</td>
                  <td className="py-2 text-right">
                    <Link href={`/admin/income/${row.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-xs text-neutral-500 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Expenses</h2>
          <Link href="/admin/expenses/new" className="text-sm text-neutral-500 hover:underline">New expense</Link>
        </div>
        {expenseRows.length === 0 ? (
          <p className="text-sm text-neutral-500">No expenses in this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2">Description</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 tabular-nums">{formatDate(row.occurredAt)}</td>
                  <td className="py-2">{row.source}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount), row.currency)}</td>
                  <td className="py-2">{row.description ?? "-"}</td>
                  <td className="py-2 text-right">
                    <Link href={`/admin/expenses/${row.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-xs text-neutral-500 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Giveaways</h2>
          <Link href="/admin/giveaways/new" className="text-sm text-neutral-500 hover:underline">New giveaway</Link>
        </div>
        {giveawayRows.length === 0 ? (
          <p className="text-sm text-neutral-500">No giveaways in this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Title</th>
                <th className="py-2">Funding</th>
                <th className="py-2 text-right">Value</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {giveawayRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 tabular-nums">{formatDate(row.occurredAt)}</td>
                  <td className="py-2">{row.title}</td>
                  <td className="py-2">{row.fundingType}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.actualCost ?? row.estimatedValue ?? 0), row.currency)}</td>
                  <td className="py-2 text-right">
                    <Link href={`/admin/giveaways/${row.id}?returnTo=${encodeURIComponent(returnTo)}`} className="text-xs text-neutral-500 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{formatCurrency(value)}</div>
    </div>
  );
}

function shiftPeriod(period: string, deltaMonths: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
