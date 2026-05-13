import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { recurringExpenseApplies, recurringInstancesForPeriod } from "@/lib/recurring-expenses";

describe("recurring expenses", () => {
  it("applies monthly rules from the start month until the optional end month", () => {
    const rule = { frequency: "monthly" as const, startMonth: "2026-01", endMonth: "2026-03" };

    expect(recurringExpenseApplies(rule, "2025-12")).toBe(false);
    expect(recurringExpenseApplies(rule, "2026-01")).toBe(true);
    expect(recurringExpenseApplies(rule, "2026-03")).toBe(true);
    expect(recurringExpenseApplies(rule, "2026-04")).toBe(false);
  });

  it("applies yearly rules only in the start month of each active year", () => {
    const rule = { frequency: "yearly" as const, startMonth: "2025-06", endMonth: null };

    expect(recurringExpenseApplies(rule, "2025-06")).toBe(true);
    expect(recurringExpenseApplies(rule, "2025-07")).toBe(false);
    expect(recurringExpenseApplies(rule, "2026-06")).toBe(true);
  });

  it("creates month instances with the rule amount", () => {
    const rows = recurringInstancesForPeriod([
      {
        id: "rule-1",
        name: "Hosting",
        source: "hosting",
        amount: new Prisma.Decimal(79),
        currency: "EUR",
        frequency: "monthly",
        startMonth: "2026-01",
        endMonth: null,
        public: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], "2026-05");

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Hosting");
    expect(rows[0].amount.toNumber()).toBe(79);
  });
});
