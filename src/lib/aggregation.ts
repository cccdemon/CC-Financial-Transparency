import { Prisma, type Confidence, type IncomeSource } from "@prisma/client";
import { db } from "@/lib/db";
import { periodBounds, yearBounds } from "@/lib/period";

const ZERO = new Prisma.Decimal(0);

export type ConfidenceLabel = "confirmed" | "estimated" | "unreviewed";

export interface PublicMonthlySummary {
  period: string;
  currency: string;
  income: number;
  expenses: number;
  giveaways: number;
  netResult: number;
  confidence: ConfidenceLabel;
  sourceBreakdown: Record<IncomeSource, number>;
  updatedAt: string;
}

export async function getPublicMonthlySummary(period: string): Promise<PublicMonthlySummary> {
  const { start, end } = periodBounds(period);

  const [incomeRows, expenseRows, giveawayRows] = await Promise.all([
    db.incomeEvent.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: { source: true, grossAmount: true, netAmount: true, confidence: true, updatedAt: true },
    }),
    db.expenseEvent.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: { amount: true, source: true, updatedAt: true },
    }),
    db.giveaway.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: { actualCost: true, estimatedValue: true, updatedAt: true },
    }),
  ]);

  const income = incomeRows.reduce(
    (acc, row) => acc.add(row.netAmount ?? row.grossAmount),
    ZERO,
  );

  const expenses = expenseRows.reduce((acc, row) => acc.add(row.amount), ZERO);

  const giveawayTotal = giveawayRows.reduce(
    (acc, row) => acc.add(row.actualCost ?? row.estimatedValue ?? ZERO),
    ZERO,
  );

  const sourceBreakdown = aggregateBySource(incomeRows);
  const confidence = confidenceLabelFor(incomeRows.map((r) => r.confidence));

  const lastUpdated = pickLatestDate([
    ...incomeRows.map((r) => r.updatedAt),
    ...expenseRows.map((r) => r.updatedAt),
    ...giveawayRows.map((r) => r.updatedAt),
  ]);

  return {
    period,
    currency: "EUR",
    income: income.toNumber(),
    expenses: expenses.toNumber(),
    giveaways: giveawayTotal.toNumber(),
    netResult: income.sub(expenses).toNumber(),
    confidence,
    sourceBreakdown,
    updatedAt: (lastUpdated ?? new Date()).toISOString(),
  };
}

export interface MonthlyBreakdown {
  period: string;
  income: number;
  expenses: number;
  giveaways: number;
  netResult: number;
}

export interface PublicYearlySummary {
  year: number;
  currency: string;
  income: number;
  expenses: number;
  giveaways: number;
  netResult: number;
  confidence: ConfidenceLabel;
  sourceBreakdown: Record<IncomeSource, number>;
  monthly: MonthlyBreakdown[];
  isPartial: boolean;
  updatedAt: string;
}

export async function getPublicYearlySummary(
  year: number,
  now = new Date(),
): Promise<PublicYearlySummary> {
  const { start, end } = yearBounds(year);

  const [incomeRows, expenseRows, giveawayRows] = await Promise.all([
    db.incomeEvent.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: {
        source: true,
        grossAmount: true,
        netAmount: true,
        confidence: true,
        occurredAt: true,
        updatedAt: true,
      },
    }),
    db.expenseEvent.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: { amount: true, source: true, occurredAt: true, updatedAt: true },
    }),
    db.giveaway.findMany({
      where: { public: true, occurredAt: { gte: start, lt: end } },
      select: {
        actualCost: true,
        estimatedValue: true,
        occurredAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const income = incomeRows.reduce(
    (acc, row) => acc.add(row.netAmount ?? row.grossAmount),
    ZERO,
  );
  const expenses = expenseRows.reduce((acc, row) => acc.add(row.amount), ZERO);
  const giveawayTotal = giveawayRows.reduce(
    (acc, row) => acc.add(row.actualCost ?? row.estimatedValue ?? ZERO),
    ZERO,
  );

  const sourceBreakdown = aggregateBySource(incomeRows);
  const confidence = confidenceLabelFor(incomeRows.map((r) => r.confidence));

  const monthly: MonthlyBreakdown[] = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(Date.UTC(year, m, 1));
    const monthEnd = new Date(Date.UTC(year, m + 1, 1));
    const inMonth = (d: Date) => d >= monthStart && d < monthEnd;

    const monthIncome = incomeRows
      .filter((r) => inMonth(r.occurredAt))
      .reduce((acc, r) => acc.add(r.netAmount ?? r.grossAmount), ZERO);
    const monthExpenses = expenseRows
      .filter((r) => inMonth(r.occurredAt))
      .reduce((acc, r) => acc.add(r.amount), ZERO);
    const monthGiveaways = giveawayRows
      .filter((r) => inMonth(r.occurredAt))
      .reduce((acc, r) => acc.add(r.actualCost ?? r.estimatedValue ?? ZERO), ZERO);

    monthly.push({
      period: `${year}-${String(m + 1).padStart(2, "0")}`,
      income: monthIncome.toNumber(),
      expenses: monthExpenses.toNumber(),
      giveaways: monthGiveaways.toNumber(),
      netResult: monthIncome.sub(monthExpenses).toNumber(),
    });
  }

  const lastUpdated = pickLatestDate([
    ...incomeRows.map((r) => r.updatedAt),
    ...expenseRows.map((r) => r.updatedAt),
    ...giveawayRows.map((r) => r.updatedAt),
  ]);

  return {
    year,
    currency: "EUR",
    income: income.toNumber(),
    expenses: expenses.toNumber(),
    giveaways: giveawayTotal.toNumber(),
    netResult: income.sub(expenses).toNumber(),
    confidence,
    sourceBreakdown,
    monthly,
    isPartial: year === now.getUTCFullYear(),
    updatedAt: (lastUpdated ?? new Date()).toISOString(),
  };
}

function aggregateBySource(
  rows: Array<{ source: IncomeSource; grossAmount: Prisma.Decimal; netAmount: Prisma.Decimal | null }>,
): Record<IncomeSource, number> {
  const acc = {} as Record<IncomeSource, Prisma.Decimal>;
  for (const row of rows) {
    const value = row.netAmount ?? row.grossAmount;
    acc[row.source] = (acc[row.source] ?? ZERO).add(value);
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, v.toNumber()]),
  ) as Record<IncomeSource, number>;
}

function confidenceLabelFor(values: Confidence[]): ConfidenceLabel {
  if (values.length === 0) return "confirmed";
  if (values.some((v) => v === "unverified")) return "unreviewed";
  if (values.some((v) => v === "estimated")) return "estimated";
  return "confirmed";
}

function pickLatestDate(dates: Date[]): Date | null {
  let latest: Date | null = null;
  for (const d of dates) {
    if (!latest || d > latest) latest = d;
  }
  return latest;
}
