import { describe, it, expect } from "vitest";
import { yearBounds, isValidYear, currentYear } from "@/lib/period";

describe("yearBounds", () => {
  it("returns UTC Jan 1 start and next-year Jan 1 end", () => {
    const { start, end } = yearBounds(2026);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("works for a previous year", () => {
    const { start, end } = yearBounds(2025);
    expect(start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws on invalid years", () => {
    expect(() => yearBounds(1800)).toThrow();
    expect(() => yearBounds(2200)).toThrow();
    expect(() => yearBounds(2026.5)).toThrow();
  });
});

describe("isValidYear", () => {
  it("accepts plausible years and rejects others", () => {
    expect(isValidYear(2026)).toBe(true);
    expect(isValidYear(2000)).toBe(true);
    expect(isValidYear(2100)).toBe(true);
    expect(isValidYear(1999)).toBe(false);
    expect(isValidYear(2101)).toBe(false);
    expect(isValidYear("2026")).toBe(false);
    expect(isValidYear(2026.1)).toBe(false);
  });
});

describe("currentYear", () => {
  it("returns the UTC year of the provided date", () => {
    expect(currentYear(new Date("2026-05-13T00:00:00Z"))).toBe(2026);
    expect(currentYear(new Date("2024-12-31T23:59:59Z"))).toBe(2024);
  });
});
