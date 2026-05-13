import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { z } from "zod";

const expenseSourceEnum = z.enum(["giveaway", "hardware", "software", "hosting", "fees", "manual_other"]);

const schema = z.object({
  source: expenseSourceEnum,
  occurredAt: z.string().min(1),
  amount: z.coerce.number(),
  currency: z.string().default("EUR"),
  public: z.union([z.literal("on"), z.literal("")]).optional(),
  description: z.string().optional(),
  receiptUrl: z.string().optional(),
});

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { id } = await params;
  const { returnTo } = await searchParams;
  const redirectTo = safeReturnTo(returnTo, "/admin/expenses");
  const row = await db.expenseEvent.findUnique({ where: { id }, include: { giveaway: true } });
  if (!row) notFound();

  async function update(formData: FormData) {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    const data = schema.parse(Object.fromEntries(formData));
    await db.expenseEvent.update({
      where: { id },
      data: {
        source: data.source,
        occurredAt: new Date(data.occurredAt),
        amount: data.amount,
        currency: data.currency || "EUR",
        public: data.public === "on",
        description: data.description || null,
        receiptUrl: data.receiptUrl || null,
      },
    });
    redirect(redirectTo);
  }

  async function remove() {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    await db.expenseEvent.delete({ where: { id } });
    redirect(redirectTo);
  }

  const occurredAtLocal = row.occurredAt.toISOString().slice(0, 16);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Edit expense</h1>
      {row.giveaway && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Linked to giveaway: <strong>{row.giveaway.title}</strong>. Deleting this expense will unlink it.
        </p>
      )}
      <form action={update} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Source</span>
          <select name="source" defaultValue={row.source} className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
            {expenseSourceEnum.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <Input name="occurredAt" type="datetime-local" label="Occurred at" required defaultValue={occurredAtLocal} />
        <Input name="amount" type="number" step="0.01" label="Amount" required defaultValue={row.amount.toString()} />
        <Input name="currency" type="text" label="Currency" defaultValue={row.currency} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="public" defaultChecked={row.public} />
          Visible on public dashboard
        </label>
        <Input name="description" type="text" label="Description" defaultValue={row.description ?? ""} />
        <Input name="receiptUrl" type="url" label="Receipt URL (optional)" defaultValue={row.receiptUrl ?? ""} />
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
