import { notFound, redirect } from "next/navigation";
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

export default async function EditGiveawayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { id } = await params;
  const { returnTo } = await searchParams;
  const redirectTo = safeReturnTo(returnTo, "/admin/giveaways");
  const row = await db.giveaway.findUnique({ where: { id } });
  if (!row) notFound();

  async function update(formData: FormData) {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    const data = schema.parse(Object.fromEntries(formData));
    const occurredAt = new Date(data.occurredAt);
    const actualCost = data.actualCost === "" || data.actualCost === undefined ? null : data.actualCost;
    const estimatedValue = data.estimatedValue === "" || data.estimatedValue === undefined ? null : data.estimatedValue;
    const currency = data.currency || "EUR";
    const isPublic = data.public === "on";
    const needsExpense = data.fundingType === "self" || data.fundingType === "mixed";
    const amount = actualCost ?? estimatedValue;

    await db.$transaction(async (tx) => {
      const existing = await tx.giveaway.findUnique({ where: { id } });
      if (!existing) return;

      let expenseEventId: string | null = existing.expenseEventId;
      if (needsExpense && amount && amount > 0) {
        if (expenseEventId) {
          await tx.expenseEvent.update({
            where: { id: expenseEventId },
            data: {
              source: "giveaway",
              occurredAt,
              amount,
              currency,
              public: isPublic,
              description: `Giveaway: ${data.title}`,
            },
          });
        } else {
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
      } else if (expenseEventId) {
        await tx.expenseEvent.delete({ where: { id: expenseEventId } });
        expenseEventId = null;
      }

      await tx.giveaway.update({
        where: { id },
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
    redirect(redirectTo);
  }

  async function remove() {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    await db.$transaction(async (tx) => {
      const existing = await tx.giveaway.findUnique({ where: { id } });
      if (!existing) return;
      await tx.giveaway.delete({ where: { id } });
      if (existing.expenseEventId) {
        await tx.expenseEvent.delete({ where: { id: existing.expenseEventId } });
      }
    });
    redirect(redirectTo);
  }

  const occurredAtLocal = row.occurredAt.toISOString().slice(0, 16);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Edit giveaway</h1>
      <form action={update} className="space-y-4">
        <Input name="title" type="text" label="Title" required defaultValue={row.title} />
        <Input name="occurredAt" type="datetime-local" label="Occurred at" required defaultValue={occurredAtLocal} />
        <Input name="itemName" type="text" label="Item name" defaultValue={row.itemName ?? ""} />
        <Input name="estimatedValue" type="number" step="0.01" label="Estimated value" defaultValue={row.estimatedValue?.toString() ?? ""} />
        <Input name="actualCost" type="number" step="0.01" label="Actual cost (only for self/mixed funding)" defaultValue={row.actualCost?.toString() ?? ""} />
        <Input name="currency" type="text" label="Currency" defaultValue={row.currency} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Funding type</span>
          <select name="fundingType" defaultValue={row.fundingType} className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
            {fundingTypeEnum.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="public" defaultChecked={row.public} />
          Visible on public dashboard
        </label>
        <Input name="publicNote" type="text" label="Public note" defaultValue={row.publicNote ?? ""} />
        <Input name="privateNote" type="text" label="Private note" defaultValue={row.privateNote ?? ""} />
        <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Save
        </button>
      </form>
      <form action={remove}>
        <button className="rounded border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-800 dark:text-rose-400">
          Delete (also removes linked expense)
        </button>
      </form>
    </div>
  );
}

function safeReturnTo(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith("/admin/") || value.startsWith("//")) return fallback;
  return value;
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
