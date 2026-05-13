import { calculateIncomeTax2026 } from "./germany-2026";

export { calculateIncomeTax2026, GERMANY_2026_TARIFF } from "./germany-2026";

export type FilingType = "single" | "joint";

export function incomeTaxDE(taxableIncome: number, taxYear = 2026): number {
  switch (taxYear) {
    case 2026:
      return calculateIncomeTax2026(taxableIncome);
    default:
      throw new Error(`No tariff configured for tax year ${taxYear}`);
  }
}

// Ehegatten-Splitting: joint_tax = income_tax(taxable / 2) * 2
export function incomeTaxJointDE(taxableIncome: number, taxYear = 2026): number {
  return incomeTaxDE(taxableIncome / 2, taxYear) * 2;
}

export function incomeTaxByFiling(
  taxableIncome: number,
  filing: FilingType,
  taxYear = 2026,
): number {
  return filing === "joint"
    ? incomeTaxJointDE(taxableIncome, taxYear)
    : incomeTaxDE(taxableIncome, taxYear);
}

export interface StreamTaxShareInput {
  estimatedTaxableIncome: number;
  nonStreamTaxableIncome: number;
  deductibleExpenseEstimate: number;
  filing: FilingType;
  taxYear?: number;
}

// Estimate how much of the total income tax is attributable to stream income.
// Uses marginal-attribution (tax_with_stream - tax_without_stream) rather than
// average rate, so reserves better match the progressive bracket the stream
// income actually lands in.
export function estimateStreamTaxShare(input: StreamTaxShareInput): number {
  const { estimatedTaxableIncome, nonStreamTaxableIncome, deductibleExpenseEstimate, filing, taxYear = 2026 } = input;

  const baselineIncome = Math.max(0, nonStreamTaxableIncome - deductibleExpenseEstimate);
  const taxWithoutStream = incomeTaxByFiling(baselineIncome, filing, taxYear);
  const taxWithStream = incomeTaxByFiling(estimatedTaxableIncome, filing, taxYear);

  return Math.max(0, taxWithStream - taxWithoutStream);
}
