import { describe, it, expect } from "vitest";
import {
  calculateIncomeTax2026,
  incomeTaxJointDE,
  estimateStreamTaxShare,
} from "@/lib/tax";

describe("§ 32a EStG 2026 — zone 1 (basic allowance, 0 tax)", () => {
  it("returns 0 for income at or below 12,348 EUR", () => {
    expect(calculateIncomeTax2026(0)).toBe(0);
    expect(calculateIncomeTax2026(5_000)).toBe(0);
    expect(calculateIncomeTax2026(12_348)).toBe(0);
  });

  it("returns 0 for negative or non-finite inputs", () => {
    expect(calculateIncomeTax2026(-1_000)).toBe(0);
    expect(calculateIncomeTax2026(NaN)).toBe(0);
  });
});

describe("§ 32a EStG 2026 — zone 2 (first progression, 12,349–17,799)", () => {
  it("just above the basic allowance produces a small tax", () => {
    // y = (12349 - 12348) / 10000 = 0.0001 → (914.51 * 0.0001 + 1400) * 0.0001 ≈ 0.14
    expect(calculateIncomeTax2026(12_349)).toBeCloseTo(0.14, 2);
  });

  it("calculates the upper edge of zone 2", () => {
    // y = (17799 - 12348) / 10000 = 0.5451
    // (914.51 * 0.5451 + 1400) * 0.5451 ≈ 1034.87
    expect(calculateIncomeTax2026(17_799)).toBeCloseTo(1_034.87, 1);
  });
});

describe("§ 32a EStG 2026 — zone 3 (second progression, 17,800–69,878)", () => {
  it("starts continuously from zone 2", () => {
    // z = (17800 - 17799) / 10000 = 0.0001 → ≈ 1034.87 + tiny
    expect(calculateIncomeTax2026(17_800)).toBeCloseTo(1_035.11, 1);
  });

  it("matches a mid-zone value", () => {
    // z = (40000 - 17799) / 10000 = 2.2201
    // (173.10 * 2.2201 + 2397) * 2.2201 + 1034.87 ≈ 7,209.63
    expect(calculateIncomeTax2026(40_000)).toBeCloseTo(7_209.63, 1);
  });

  it("calculates the upper edge of zone 3", () => {
    // z = (69878 - 17799) / 10000 = 5.2079
    // (173.10 * 5.2079 + 2397) * 5.2079 + 1034.87 ≈ 18,213.06
    expect(calculateIncomeTax2026(69_878)).toBeCloseTo(18_213.06, 1);
  });
});

describe("§ 32a EStG 2026 — zone 4 (42 % marginal, 69,879–277,825)", () => {
  it("69,879 EUR → 0.42 * 69879 - 11135.63", () => {
    expect(calculateIncomeTax2026(69_879)).toBeCloseTo(0.42 * 69_879 - 11_135.63, 2);
  });

  it("100,000 EUR is in zone 4", () => {
    expect(calculateIncomeTax2026(100_000)).toBeCloseTo(0.42 * 100_000 - 11_135.63, 2);
  });

  it("upper edge of zone 4", () => {
    expect(calculateIncomeTax2026(277_825)).toBeCloseTo(0.42 * 277_825 - 11_135.63, 2);
  });
});

describe("§ 32a EStG 2026 — zone 5 (45 % marginal, from 277,826)", () => {
  it("277,826 EUR uses the 45 % formula", () => {
    expect(calculateIncomeTax2026(277_826)).toBeCloseTo(0.45 * 277_826 - 19_470.38, 2);
  });

  it("500,000 EUR is in zone 5", () => {
    expect(calculateIncomeTax2026(500_000)).toBeCloseTo(0.45 * 500_000 - 19_470.38, 2);
  });
});

describe("Ehegatten-Splitting (joint filing)", () => {
  it("doubles the tax of half the joint income", () => {
    const taxable = 80_000;
    const expected = calculateIncomeTax2026(taxable / 2) * 2;
    expect(incomeTaxJointDE(taxable)).toBeCloseTo(expected, 2);
  });

  it("a joint couple with 24,696 EUR (basic allowance × 2) pays no tax", () => {
    expect(incomeTaxJointDE(24_696)).toBe(0);
  });
});

describe("estimateStreamTaxShare", () => {
  it("never returns a negative share", () => {
    const share = estimateStreamTaxShare({
      estimatedTaxableIncome: 5_000,
      nonStreamTaxableIncome: 50_000,
      deductibleExpenseEstimate: 0,
      filing: "single",
    });
    expect(share).toBeGreaterThanOrEqual(0);
  });

  it("equals total tax when there is no other income", () => {
    const share = estimateStreamTaxShare({
      estimatedTaxableIncome: 40_000,
      nonStreamTaxableIncome: 0,
      deductibleExpenseEstimate: 0,
      filing: "single",
    });
    expect(share).toBeCloseTo(calculateIncomeTax2026(40_000), 2);
  });

  it("matches marginal incremental tax (with-stream minus without-stream)", () => {
    const share = estimateStreamTaxShare({
      estimatedTaxableIncome: 80_000,
      nonStreamTaxableIncome: 50_000,
      deductibleExpenseEstimate: 0,
      filing: "single",
    });
    const expected = calculateIncomeTax2026(80_000) - calculateIncomeTax2026(50_000);
    expect(share).toBeCloseTo(expected, 2);
  });
});
