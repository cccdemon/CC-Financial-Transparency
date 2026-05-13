import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const FUNDING_LABEL: Record<string, string> = {
  self: "Self-financed",
  community: "Community",
  sponsor: "Sponsor",
  mixed: "Mixed",
};

export default async function PublicGiveawaysPage() {
  const rows = await db.giveaway.findMany({
    where: { public: true },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="space-y-1">
        <Link href="/financial" className="text-sm text-neutral-500 hover:underline">← Back</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Giveaways</h1>
        <p className="text-sm text-neutral-500">
          Self-financed giveaways are funded from stream profit and reduce the public net result.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No giveaways recorded yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Date</th>
              <th className="py-2">Title</th>
              <th className="py-2">Funding</th>
              <th className="py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const value = row.actualCost ?? row.estimatedValue;
              return (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 tabular-nums">
                    {row.occurredAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2">
                    <div>{row.title}</div>
                    {row.publicNote && (
                      <div className="text-xs text-neutral-500">{row.publicNote}</div>
                    )}
                  </td>
                  <td className="py-2">{FUNDING_LABEL[row.fundingType] ?? row.fundingType}</td>
                  <td className="py-2 text-right tabular-nums">
                    {value
                      ? new Intl.NumberFormat("de-DE", {
                          style: "currency",
                          currency: row.currency,
                        }).format(value.toNumber())
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
