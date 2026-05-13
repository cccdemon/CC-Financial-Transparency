import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RecurringExpensesPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  const rows = await db.recurringExpense.findMany({
    orderBy: [{ startMonth: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring expenses</h1>
        <Link href="/admin/recurring-expenses/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          + New recurring expense
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No recurring expenses configured yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Name</th>
              <th className="py-2">Frequency</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2">Active</th>
              <th className="py-2">Public</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2">{row.name}</td>
                <td className="py-2">{row.frequency}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount), row.currency)}</td>
                <td className="py-2 tabular-nums">{row.startMonth} - {row.endMonth ?? "open"}</td>
                <td className="py-2">{row.public ? "yes" : "no"}</td>
                <td className="py-2 text-right">
                  <Link href={`/admin/recurring-expenses/${row.id}`} className="text-xs text-neutral-500 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}
