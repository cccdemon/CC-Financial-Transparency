import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IncomeListPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  const rows = await db.incomeEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Income events</h1>
        <div className="flex gap-2">
          <Link href="/admin/income/import/twitch-payments" className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700">
            Import Twitch payments
          </Link>
          <Link href="/admin/income/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            + New income
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No income recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Occurred</th>
              <th className="py-2">Source</th>
              <th className="py-2 text-right">Gross</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2">Confidence</th>
              <th className="py-2">Public</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 tabular-nums">{r.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="py-2">{r.source}</td>
                <td className="py-2 text-right tabular-nums">{r.grossAmount.toString()}</td>
                <td className="py-2 text-right tabular-nums">{r.netAmount?.toString() ?? "—"}</td>
                <td className="py-2">{r.confidence}</td>
                <td className="py-2">{r.public ? "yes" : "no"}</td>
                <td className="py-2 text-right">
                  <Link href={`/admin/income/${r.id}`} className="text-xs text-neutral-500 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
