import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GiveawaysListPage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  const rows = await db.giveaway.findMany({
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Giveaways</h1>
        <Link href="/admin/giveaways/new" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          + New giveaway
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No giveaways recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Occurred</th>
              <th className="py-2">Title</th>
              <th className="py-2">Funding</th>
              <th className="py-2 text-right">Estimated</th>
              <th className="py-2 text-right">Actual</th>
              <th className="py-2">Public</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 tabular-nums">{r.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="py-2">{r.title}</td>
                <td className="py-2">{r.fundingType}</td>
                <td className="py-2 text-right tabular-nums">{r.estimatedValue?.toString() ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{r.actualCost?.toString() ?? "—"}</td>
                <td className="py-2">{r.public ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
