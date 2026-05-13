// Period strings are always "YYYY-MM" in UTC.

export type Period = `${number}-${string}`;

export function currentMonthPeriod(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isValidPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function periodBounds(period: string): { start: Date; end: Date } {
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period: ${period}`);
  }
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}
