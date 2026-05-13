import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { yearBounds } from "@/lib/period";
import { recurringInstancesForPeriod } from "@/lib/recurring-expenses";

const ZERO = new Prisma.Decimal(0);

export interface ProfitLossLine {
  date: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
}

export interface ProfitLossReport {
  year: number;
  currency: string;
  incomeTotal: number;
  expenseTotal: number;
  profit: number;
  incomeLines: ProfitLossLine[];
  expenseLines: ProfitLossLine[];
  monthly: Array<{
    period: string;
    income: number;
    expenses: number;
    profit: number;
  }>;
  generatedAt: string;
}

export async function getProfitLossReport(year: number): Promise<ProfitLossReport> {
  const { start, end } = yearBounds(year);

  const [incomeRows, expenseRows, giveawayRows, recurringRules] = await Promise.all([
    db.incomeEvent.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
    db.expenseEvent.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
    db.giveaway.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
    }),
    db.recurringExpense.findMany({
      where: {
        startMonth: { lte: `${year}-12` },
        OR: [{ endMonth: null }, { endMonth: { gte: `${year}-01` } }],
      },
    }),
  ]);

  const incomeLines: ProfitLossLine[] = incomeRows.map((row) => ({
    date: formatDate(row.occurredAt),
    category: label(row.source),
    description: row.description || label(row.source),
    amount: Number(row.netAmount ?? row.grossAmount),
    currency: row.currency,
  }));

  const expenseLines: ProfitLossLine[] = [
    ...expenseRows.map((row) => ({
      date: formatDate(row.occurredAt),
      category: label(row.source),
      description: row.description || label(row.source),
      amount: Number(row.amount),
      currency: row.currency,
    })),
    ...giveawayRows.map((row) => ({
      date: formatDate(row.occurredAt),
      category: "Giveaway",
      description: row.publicNote || row.title,
      amount: Number(row.actualCost ?? row.estimatedValue ?? 0),
      currency: row.currency,
    })),
  ];

  const recurringByMonth = new Map<string, Prisma.Decimal>();
  for (let month = 1; month <= 12; month += 1) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const instances = recurringInstancesForPeriod(recurringRules, period);
    const total = instances.reduce((acc, row) => acc.add(row.amount), ZERO);
    recurringByMonth.set(period, total);

    for (const row of instances) {
      expenseLines.push({
        date: `${period}-01`,
        category: `${label(row.rule.source)} recurring`,
        description: row.description,
        amount: Number(row.amount),
        currency: row.currency,
      });
    }
  }

  expenseLines.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const monthIncome = incomeRows
      .filter((row) => row.occurredAt.getUTCMonth() + 1 === month)
      .reduce((acc, row) => acc.add(row.netAmount ?? row.grossAmount), ZERO);
    const monthExpenses = expenseRows
      .filter((row) => row.occurredAt.getUTCMonth() + 1 === month)
      .reduce((acc, row) => acc.add(row.amount), ZERO)
      .add(giveawayRows
        .filter((row) => row.occurredAt.getUTCMonth() + 1 === month)
        .reduce((acc, row) => acc.add(row.actualCost ?? row.estimatedValue ?? ZERO), ZERO))
      .add(recurringByMonth.get(period) ?? ZERO);

    return {
      period,
      income: monthIncome.toNumber(),
      expenses: monthExpenses.toNumber(),
      profit: monthIncome.sub(monthExpenses).toNumber(),
    };
  });

  const incomeTotal = incomeLines.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = expenseLines.reduce((sum, row) => sum + row.amount, 0);

  return {
    year,
    currency: dominantCurrency([...incomeLines, ...expenseLines]) ?? "EUR",
    incomeTotal,
    expenseTotal,
    profit: incomeTotal - expenseTotal,
    incomeLines,
    expenseLines,
    monthly,
    generatedAt: new Date().toISOString(),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function label(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dominantCurrency(lines: ProfitLossLine[]): string | null {
  const currencies = new Set(lines.map((line) => line.currency));
  return currencies.size === 1 ? [...currencies][0] : null;
}
