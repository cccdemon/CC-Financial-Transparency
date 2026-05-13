import { z } from "zod";
import type { ExpenseSource, RecurrenceFrequency } from "@prisma/client";

const expenseSourceEnum = z.enum(["giveaway", "hardware", "software", "hosting", "fees", "manual_other"]);
const frequencyEnum = z.enum(["monthly", "yearly"]);

export const recurringExpenseSchema = z.object({
  name: z.string().min(1),
  source: expenseSourceEnum,
  amount: z.coerce.number(),
  currency: z.string().default("EUR"),
  frequency: frequencyEnum,
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  endMonth: z.union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), z.literal("")]).optional(),
  public: z.union([z.literal("on"), z.literal("")]).optional(),
  description: z.string().optional(),
});

export function RecurringExpenseForm({
  title,
  action,
  defaults,
}: {
  title: string;
  action: (formData: FormData) => void | Promise<void>;
  defaults?: {
    name: string;
    source: ExpenseSource;
    amount: string;
    currency: string;
    frequency: RecurrenceFrequency;
    startMonth: string;
    endMonth: string;
    public: boolean;
    description: string;
  };
}) {
  return (
    <form action={action} className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Input name="name" type="text" label="Name" required defaultValue={defaults?.name ?? ""} />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Source</span>
        <select name="source" defaultValue={defaults?.source ?? "hosting"} className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          {expenseSourceEnum.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <Input name="amount" type="number" step="0.01" label="Amount" required defaultValue={defaults?.amount ?? ""} />
      <Input name="currency" type="text" label="Currency" defaultValue={defaults?.currency ?? "EUR"} />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Frequency</span>
        <select name="frequency" defaultValue={defaults?.frequency ?? "monthly"} className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          {frequencyEnum.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <Input name="startMonth" type="month" label="Start month" required defaultValue={defaults?.startMonth ?? ""} />
      <Input name="endMonth" type="month" label="End month (optional)" defaultValue={defaults?.endMonth ?? ""} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked={defaults?.public ?? true} />
        Visible on public dashboard
      </label>
      <Input name="description" type="text" label="Description (optional)" defaultValue={defaults?.description ?? ""} />
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
