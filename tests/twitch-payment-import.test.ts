import { describe, expect, it } from "vitest";
import { parseTwitchPaymentHistoryCsv } from "@/lib/twitch-payment-import";

const CSV = `Amount submitted,Payment method,Status
"USD 157,49",PayPal,Eingereicht
"USD 208,97",PayPal,Bezahlt
"USD 51,72",PayPal,Bezahlt
`;

const MONTHLY_CSV = `Month,Amount submitted,Payment method,Status
2026-04,"USD 208,97",PayPal,Bezahlt
2026-03,"USD 200,41",PayPal,Bezahlt
2025-12,"USD 354,60",PayPal,Bezahlt
`;

const GERMAN_HISTORY = `Genehmigungsdatum
Bezahlter Betrag,Auszahlungsmethode,Status
13 Mai 2026
USD 157,49
PayPal
Eingereicht
13 April 2026
USD 208,97
PayPal
Bezahlt
11 März 2026
USD 200,41
PayPal
Bezahlt
11 Februar 2026
USD 53,32
PayPal
Bezahlt
13 Januar 2026
USD 92,57
PayPal
Bezahlt
11 Dezember 2025
USD 354,60
PayPal
Bezahlt
10 Oktober 2025
USD 65,36
PayPal
Bezahlt
11 Juni 2025
USD 50,40
PayPal
Bezahlt
11 Dezember 2024
USD 51,72
PayPal
Bezahlt
`;

describe("parseTwitchPaymentHistoryCsv", () => {
  it("parses Twitch payment rows with quoted decimal commas", () => {
    const rows = parseTwitchPaymentHistoryCsv(CSV);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      amount: 157.49,
      currency: "USD",
      occurredAt: null,
      paymentMethod: "PayPal",
      rawStatus: "Eingereicht",
      status: "submitted",
    });
    expect(rows[1]).toMatchObject({
      amount: 208.97,
      currency: "USD",
      status: "paid",
    });
  });

  it("creates stable distinct ids for duplicate rows in the same file", () => {
    const rows = parseTwitchPaymentHistoryCsv(`${CSV}"USD 51,72",PayPal,Bezahlt\n`);

    expect(rows[2].externalId).not.toBe(rows[3].externalId);
    expect(parseTwitchPaymentHistoryCsv(CSV)[2].externalId).toBe(rows[2].externalId);
  });

  it("parses plain CSV with a per-row month column", () => {
    const rows = parseTwitchPaymentHistoryCsv(MONTHLY_CSV);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      amount: 208.97,
      currency: "USD",
      status: "paid",
    });
    expect(rows[0].occurredAt?.toISOString()).toBe("2026-04-01T12:00:00.000Z");
    expect(rows[1].occurredAt?.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(rows[2].occurredAt?.toISOString()).toBe("2025-12-01T12:00:00.000Z");
  });

  it("parses plain CSV with a per-row German approval date column", () => {
    const rows = parseTwitchPaymentHistoryCsv(
      `Genehmigungsdatum,Amount submitted,Payment method,Status\n13 April 2026,"USD 208,97",PayPal,Bezahlt\n`,
    );

    expect(rows[0].occurredAt?.toISOString()).toBe("2026-04-13T12:00:00.000Z");
  });

  it("parses German Twitch payout history with per-row approval dates", () => {
    const rows = parseTwitchPaymentHistoryCsv(GERMAN_HISTORY);

    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({
      amount: 157.49,
      currency: "USD",
      status: "submitted",
    });
    expect(rows[0].occurredAt?.toISOString()).toBe("2026-05-13T12:00:00.000Z");
    expect(rows[1]).toMatchObject({
      amount: 208.97,
      status: "paid",
    });
    expect(rows[1].occurredAt?.toISOString()).toBe("2026-04-13T12:00:00.000Z");
    expect(rows[2].occurredAt?.toISOString()).toBe("2026-03-11T12:00:00.000Z");
    expect(rows[8].occurredAt?.toISOString()).toBe("2024-12-11T12:00:00.000Z");
  });

  it("keeps a legacy id so dated re-imports can update the earlier no-date import", () => {
    const legacy = parseTwitchPaymentHistoryCsv(CSV)[1];
    const dated = parseTwitchPaymentHistoryCsv(GERMAN_HISTORY)[1];

    expect(dated.legacyExternalId).toBe(legacy.externalId);
    expect(dated.externalId).not.toBe(legacy.externalId);
  });

  it("rejects files without the expected headers", () => {
    expect(() => parseTwitchPaymentHistoryCsv("Amount,Status\n1,Paid\n")).toThrow(
      /Missing required CSV headers/,
    );
  });
});
