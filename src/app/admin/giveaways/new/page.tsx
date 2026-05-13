import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { z } from "zod";

const fundingTypeEnum = z.enum(["self", "community", "sponsor", "mixed"]);

const schema = z.object({
  title: z.string().min(1),
  occurredAt: z.string().min(1),
  itemName: z.string().optional(),
  estimatedValue: z.union([z.coerce.number(), z.literal("")]).optional(),
  actualCost: z.union([z.coerce.number(), z.literal("")]).optional(),
  currency: z.string().default("EUR"),
  fundingType: fundingTypeEnum,
  public: z.union([z.literal("on"), z.literal("")]).optional(),
  publicNote: z.string().optional(),
  privateNote: z.string().optional(),
});

export default async function NewGiveawayPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  async function create(formData: FormData) {
    "use server";
    const session = await getAdminSession();
    if (!session) redirect("/admin/login");

    const data = schema.parse(Object.fromEntries(formData));
    const occurredAt = new Date(data.occurredAt);
    const actualCost = data.actualCost === "" || data.actualCost === undefined ? null : data.actualCost;
    const estimatedValue = data.estimatedValue === "" || data.estimatedValue === undefined ? null : data.estimatedValue;
    const currency = data.currency || "EUR";
    const isPublic = data.public === "on";

    // Per spec: when a self-financed giveaway is created, create a linked
    // expense_events row with source = giveaway. We use actualCost if set,
    // otherwise estimatedValue.
    await db.$transaction(async (tx) => {
      let expenseEventId: string | null = null;
      if (data.fundingType === "self" || data.fundingType === "mixed") {
        const amount = actualCost ?? estimatedValue;
        if (amount && amount > 0) {
          const expense = await tx.expenseEvent.create({
            data: {
              source: "giveaway",
              occurredAt,
              amount,
              currency,
              public: isPublic,
              description: `Giveaway: ${data.title}`,
            },
          });
          expenseEventId = expense.id;
        }
      }
      await tx.giveaway.create({
        data: {
          title: data.title,
          occurredAt,
          itemName: data.itemName || null,
          estimatedValue,
          actualCost,
          currency,
          fundingType: data.fundingType,
          public: isPublic,
          publicNote: data.publicNote || null,
          privateNote: data.privateNote || null,
          expenseEventId,
        },
      });
    });
    redirect("/admin");
  }

  return (
    <form action={create} className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">New giveaway</h1>
      <Input name="title" type="text" label="Title" required />
      <Input name="occurredAt" type="datetime-local" label="Occurred at" required />
      <Input name="itemName" type="text" label="Item name" />
      <Input name="estimatedValue" type="number" step="0.01" label="Estimated value" />
      <Input name="actualCost" type="number" step="0.01" label="Actual cost (only for self/mixed funding)" />
      <Input name="currency" type="text" label="Currency" defaultValue="EUR" />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Funding type</span>
        <select name="fundingType" className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          {fundingTypeEnum.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked />
        Visible on public dashboard
      </label>
      <Input name="publicNote" type="text" label="Public note" />
      <Input name="privateNote" type="text" label="Private note" />
      <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
        Save
      </button>
    </form>
  );
}

function Input(props: { name: string; type: string; label: string; required?: boolean; step?: string; defaultValue?: string }) {
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
