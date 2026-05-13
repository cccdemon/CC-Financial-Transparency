import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { recurringExpenseSchema, RecurringExpenseForm } from "../recurring-expense-form";

export default async function EditRecurringExpensePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { id } = await params;
  const row = await db.recurringExpense.findUnique({ where: { id } });
  if (!row) notFound();

  async function update(formData: FormData) {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    const data = recurringExpenseSchema.parse(Object.fromEntries(formData));
    await db.recurringExpense.update({
      where: { id },
      data: {
        name: data.name,
        source: data.source,
        amount: data.amount,
        currency: data.currency || "EUR",
        frequency: data.frequency,
        startMonth: data.startMonth,
        endMonth: data.endMonth || null,
        public: data.public === "on",
        description: data.description || null,
      },
    });
    redirect("/admin/recurring-expenses");
  }

  async function remove() {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    await db.recurringExpense.delete({ where: { id } });
    redirect("/admin/recurring-expenses");
  }

  return (
    <div className="space-y-4">
      <RecurringExpenseForm
        title="Edit recurring expense"
        action={update}
        defaults={{
          name: row.name,
          source: row.source,
          amount: row.amount.toString(),
          currency: row.currency,
          frequency: row.frequency,
          startMonth: row.startMonth,
          endMonth: row.endMonth ?? "",
          public: row.public,
          description: row.description ?? "",
        }}
      />
      <form action={remove}>
        <button className="rounded border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-800 dark:text-rose-400">
          Delete
        </button>
      </form>
    </div>
  );
}
