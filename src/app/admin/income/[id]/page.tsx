import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest, safeAdminRedirect } from "@/lib/security";
import { z } from "zod";
import type { IncomeSource, Confidence } from "@prisma/client";

const incomeSourceEnum = z.enum([
  "twitch_sub",
  "twitch_resub",
  "twitch_gift_sub",
  "twitch_bits",
  "twitch_hype_train",
  "manual_twitch_payout",
  "manual_ad_revenue",
  "manual_sponsor",
  "manual_other",
]);

const schema = z.object({
  source: incomeSourceEnum,
  occurredAt: z.string().min(1),
  grossAmount: z.coerce.number(),
  netAmount: z.union([z.coerce.number(), z.literal("")]).optional(),
  currency: z.string().default("EUR"),
  confidence: z.enum(["actual", "estimated", "unverified"]),
  public: z.union([z.literal("on"), z.literal("")]).optional(),
  description: z.string().optional(),
});

export default async function EditIncomePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { id } = await params;
  const { returnTo } = await searchParams;
  const redirectTo = safeAdminRedirect(returnTo, "/admin/income");
  const row = await db.incomeEvent.findUnique({ where: { id } });
  if (!row) notFound();

  async function update(formData: FormData) {
    "use server";
    await assertSameOriginRequest();
    if (!(await getAdminSession())) redirect("/admin/login");
    const data = schema.parse(Object.fromEntries(formData));
    await db.incomeEvent.update({
      where: { id },
      data: {
        source: data.source,
        occurredAt: new Date(data.occurredAt),
        grossAmount: data.grossAmount,
        netAmount: data.netAmount === "" || data.netAmount === undefined ? null : data.netAmount,
        currency: data.currency || "EUR",
        confidence: data.confidence,
        public: data.public === "on",
        description: data.description || null,
      },
    });
    redirect(redirectTo);
  }

  async function remove() {
    "use server";
    await assertSameOriginRequest();
    if (!(await getAdminSession())) redirect("/admin/login");
    await db.incomeEvent.delete({ where: { id } });
    redirect(redirectTo);
  }

  const occurredAtLocal = toLocalInput(row.occurredAt);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Edit income entry</h1>
      <form action={update} className="space-y-4">
        <Select name="source" label="Source" options={incomeSourceEnum.options} value={row.source as IncomeSource} />
        <Field name="occurredAt" type="datetime-local" label="Occurred at" required defaultValue={occurredAtLocal} />
        <Field name="grossAmount" type="number" step="0.01" label="Gross amount" required defaultValue={row.grossAmount.toString()} />
        <Field name="netAmount" type="number" step="0.01" label="Net amount (optional)" defaultValue={row.netAmount?.toString() ?? ""} />
        <Field name="currency" type="text" label="Currency" defaultValue={row.currency} />
        <Select name="confidence" label="Confidence" options={["actual", "estimated", "unverified"]} value={row.confidence as Confidence} />
        <Checkbox name="public" label="Visible on public dashboard" defaultChecked={row.public} />
        <Field name="description" type="text" label="Description (optional)" defaultValue={row.description ?? ""} />
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Save
        </button>
      </form>
      <form action={remove}>
        <button className="rounded border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-800 dark:text-rose-400">
          Delete
        </button>
      </form>
    </div>
  );
}

function toLocalInput(d: Date): string {
  return d.toISOString().slice(0, 16);
}

function Field(props: { name: string; label: string; type: string; required?: boolean; step?: string; defaultValue?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{props.label}</span>
      <input
        name={props.name}
        type={props.type}
        step={props.step}
        required={props.required}
        defaultValue={props.defaultValue}
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}

function Select({ name, label, options, value }: { name: string; label: string; options: readonly string[]; value: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
