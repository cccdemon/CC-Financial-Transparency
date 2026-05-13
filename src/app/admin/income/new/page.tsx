import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest } from "@/lib/security";
import { z } from "zod";

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

export default async function NewIncomePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  async function create(formData: FormData) {
    "use server";
    await assertSameOriginRequest();
    const session = await getAdminSession();
    if (!session) redirect("/admin/login");

    const data = schema.parse(Object.fromEntries(formData));
    await db.incomeEvent.create({
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
    redirect("/admin");
  }

  return (
    <form action={create} className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">New income entry</h1>
      <Select name="source" label="Source" options={incomeSourceEnum.options} />
      <Field name="occurredAt" type="datetime-local" label="Occurred at" required />
      <Field name="grossAmount" type="number" step="0.01" label="Gross amount" required />
      <Field name="netAmount" type="number" step="0.01" label="Net amount (optional)" />
      <Field name="currency" type="text" label="Currency" defaultValue="EUR" />
      <Select name="confidence" label="Confidence" options={["actual", "estimated", "unverified"]} />
      <Checkbox name="public" label="Visible on public dashboard" defaultChecked />
      <Field name="description" type="text" label="Description (optional)" />
      <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
        Save
      </button>
    </form>
  );
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

function Select({ name, label, options }: { name: string; label: string; options: readonly string[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
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
