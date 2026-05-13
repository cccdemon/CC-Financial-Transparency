import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { parseTwitchPaymentHistoryCsv } from "@/lib/twitch-payment-import";

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

    const file = formData.get("file");
    const pastedCsv = String(formData.get("csv") ?? "");
    const occurredAtValue = String(formData.get("occurredAt") ?? "");
    const includeSubmitted = formData.get("includeSubmitted") === "on";
    const publicRows = formData.get("public") === "on";

    const csv = file instanceof File && file.size > 0
      ? await file.text()
      : pastedCsv;
    if (!csv.trim()) {
      redirect("/admin/income/import/twitch-payments?error=missing_csv");
    }

    const occurredAt = occurredAtValue ? new Date(`${occurredAtValue}T12:00:00Z`) : new Date();
    if (!Number.isFinite(occurredAt.getTime())) {
      redirect("/admin/income/import/twitch-payments?error=invalid_date");
    }

    let rows;
    try {
      rows = parseTwitchPaymentHistoryCsv(csv);
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
        occurredAt: row.occurredAt ?? occurredAt,
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
          Upload the Twitch payment history CSV or paste the German payout history table with Genehmigungsdatum.
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

      <form action={importPayments} className="space-y-4" encType="multipart/form-data">
        <label className="block space-y-1">
          <span className="text-sm font-medium">CSV file</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Or paste CSV</span>
          <textarea
            name="csv"
            rows={8}
            className="block w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
            placeholder={`Genehmigungsdatum\nBezahlter Betrag,Auszahlungsmethode,Status\n13 April 2026\nUSD 208,97\nPayPal\nBezahlt`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Occurred at</span>
          <input
            name="occurredAt"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <span className="text-xs text-neutral-500">
            Used only for CSV exports that do not include a per-row approval date.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="includeSubmitted" />
          Include submitted rows that are not paid yet
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="public" defaultChecked />
          Visible on public dashboard
        </label>

        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Import payments
        </button>
      </form>
    </div>
  );
}
