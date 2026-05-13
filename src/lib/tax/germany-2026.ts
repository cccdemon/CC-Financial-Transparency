// § 32a EStG income tax tariff for tax year 2026.
// Source: https://www.gesetze-im-internet.de/estg/__32a.html
//         https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32a/inhalt.html
// Re-verify each January — the basic allowance and bracket thresholds are
// updated annually by the Bundesfinanzministerium.

export const GERMANY_2026_TARIFF = {
  year: 2026,
  currency: "EUR",
  basicAllowance: 12_348,
  zones: [
    { from: 0, to: 12_348 },
    { from: 12_349, to: 17_799 },
    { from: 17_800, to: 69_878 },
    { from: 69_879, to: 277_825 },
    { from: 277_826, to: null },
  ],
} as const;

export function calculateIncomeTax2026(taxableIncome: number): number {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;
  const x = Math.floor(taxableIncome);

  if (x <= 12_348) return 0;

  if (x <= 17_799) {
    const y = (x - 12_348) / 10_000;
    return round2((914.51 * y + 1_400) * y);
  }

  if (x <= 69_878) {
    const z = (x - 17_799) / 10_000;
    return round2((173.10 * z + 2_397) * z + 1_034.87);
  }

  if (x <= 277_825) {
    return round2(0.42 * x - 11_135.63);
  }

  return round2(0.45 * x - 19_470.38);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
