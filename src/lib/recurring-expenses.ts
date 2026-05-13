import { Prisma, type RecurringExpense } from "@prisma/client";

export interface RecurringExpenseInstance {
  rule: RecurringExpense;
  period: string;
  amount: Prisma.Decimal;
  currency: string;
  description: string;
}

export function recurringExpenseApplies(rule: Pick<RecurringExpense, "frequency" | "startMonth" | "endMonth">, period: string): boolean {
  if (period < rule.startMonth) return false;
  if (rule.endMonth && period > rule.endMonth) return false;
  if (rule.frequency === "monthly") return true;
  return period.endsWith(rule.startMonth.slice(4, 7));
}

export function recurringInstancesForPeriod(
  rules: RecurringExpense[],
  period: string,
): RecurringExpenseInstance[] {
  return rules
    .filter((rule) => recurringExpenseApplies(rule, period))
    .map((rule) => ({
      rule,
      period,
      amount: rule.amount,
      currency: rule.currency,
      description: rule.description || rule.name,
    }));
}

export function recurringExpenseWhereForPeriod(period: string, publicOnly = false): Prisma.RecurringExpenseWhereInput {
  return {
    startMonth: { lte: period },
    OR: [{ endMonth: null }, { endMonth: { gte: period } }],
    ...(publicOnly ? { public: true } : {}),
  };
}
