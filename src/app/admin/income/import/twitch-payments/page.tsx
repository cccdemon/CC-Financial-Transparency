import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { parseTwitchPaymentHistoryCsv } from "@/lib/twitch-payment-import";
import { TwitchPaymentImportForm } from "./TwitchPaymentImportForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TwitchPaymentImportPage({ searchParams }: PageProps) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const sp = await searchParams;

  async function importPayments(formData: FormData) {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");

    const pastedCsv = String(formData.get("csv") ?? "");
    const includeSubmitted = formData.get("includeSubmitted") === "on";
    const publicRows = formData.get("public") === "on";

    if (!pastedCsv.trim()) {
      redirect("/admin/income/import/twitch-payments?error=missing_csv");
    }

    let rows;
    try {
      rows = parseTwitchPaymentHistoryCsv(pastedCsv);
    } catch (e) {
      const message = e instanceof Error ? e.message : "invalid_csv";
      redirect(`/admin/income/import/twitch-payments?error=${encodeURIComponent(message)}`);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const row of rows) {
      if (row.status !== "paid" && !(includeSubmitted && row.status === "submitted")) {
        skipped += 1;
        continue;
      }

      const data = {
        source: "manual_twitch_payout" as const,
        occurredAt: row.occurredAt ?? new Date(),
        grossAmount: row.amount,
        netAmount: row.amount,
        currency: row.currency,
        confidence: row.status === "paid" ? "actual" as const : "unverified" as const,
        public: publicRows,
        description: `Twitch payout via ${row.paymentMethod} (${row.rawStatus})`,
        externalId: row.externalId,
      };

      try {
        if (row.occurredAt && row.legacyExternalId !== row.externalId) {
          const legacy = await db.incomeEvent.findUnique({
            where: { externalId: row.legacyExternalId },
            select: { id: true },
          });
          if (legacy) {
            await db.incomeEvent.update({
              where: { id: legacy.id },
              data,
            });
            updated += 1;
            continue;
          }
        }

        await db.incomeEvent.create({ data });
        imported += 1;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          duplicates += 1;
          continue;
        }
        throw e;
      }
    }

    const params = new URLSearchParams({
      imported: String(imported),
      updated: String(updated),
      skipped: String(skipped),
      duplicates: String(duplicates),
    });
    redirect(`/admin/income/import/twitch-payments?${params.toString()}`);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin/income" className="text-sm text-neutral-500 hover:underline">
          Back to income
        </Link>
        <h1 className="text-xl font-semibold">Import Twitch payment history</h1>
        <p className="text-sm text-neutral-500">
          Upload or paste the basic Twitch CSV, preview each payment row, then add its payout month/date before import.
        </p>
      </div>

      {sp.error && (
        <p className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          Import failed: {String(sp.error)}
        </p>
      )}
      {sp.imported !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Imported {String(sp.imported)} rows. Updated {String(sp.updated ?? 0)}. Skipped {String(sp.skipped ?? 0)}. Duplicates {String(sp.duplicates ?? 0)}.
        </p>
      )}

      <TwitchPaymentImportForm importAction={importPayments} />
    </div>
  );
}
