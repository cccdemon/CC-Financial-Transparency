import Link from "next/link";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentMonthPeriod } from "@/lib/period";
import { getPublicMonthlySummary } from "@/lib/aggregation";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const period = currentMonthPeriod();
  const summary = await getPublicMonthlySummary(period);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">This month — {period}</h1>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat label="Income" value={summary.income} />
        <Stat label="Expenses" value={summary.expenses} />
        <Stat label="Giveaways" value={summary.giveaways} />
        <Stat label="Net" value={summary.netResult} />
      </ul>
      <div className="flex flex-wrap gap-3 text-sm">
        <Action href="/admin/income/new">+ Income</Action>
        <Action href="/admin/expenses/new">+ Expense</Action>
        <Action href="/admin/giveaways/new">+ Giveaway</Action>
      </div>
      <p className="text-xs text-neutral-500">Signed in as {session.email}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value)}
      </div>
    </li>
  );
}

function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      {children}
    </Link>
  );
}
