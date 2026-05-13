import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { recurringExpenseSchema, RecurringExpenseForm } from "../recurring-expense-form";

export default async function NewRecurringExpensePage() {
  if (!(await getAdminSession())) redirect("/admin/login");

  async function create(formData: FormData) {
    "use server";
    if (!(await getAdminSession())) redirect("/admin/login");
    const data = recurringExpenseSchema.parse(Object.fromEntries(formData));
    await db.recurringExpense.create({
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

  return <RecurringExpenseForm title="New recurring expense" action={create} />;
}
