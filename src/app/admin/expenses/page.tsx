import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExpensesListPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  const rows = await db.expenseEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Expenses</h1>
        <Link href="/admin/expenses/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          + New expense
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No expenses recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Occurred</th>
              <th className="py-2">Source</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2">Description</th>
              <th className="py-2">Public</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 tabular-nums">{r.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="py-2">{r.source}</td>
                <td className="py-2 text-right tabular-nums">{r.amount.toString()}</td>
                <td className="py-2">{r.description ?? "—"}</td>
                <td className="py-2">{r.public ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
