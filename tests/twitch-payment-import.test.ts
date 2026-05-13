import { describe, expect, it } from "vitest";
import { parseTwitchPaymentHistoryCsv } from "@/lib/twitch-payment-import";

const CSV = `Amount submitted,Payment method,Status
"USD 157,49",PayPal,Eingereicht
"USD 208,97",PayPal,Bezahlt
"USD 51,72",PayPal,Bezahlt
`;

describe("parseTwitchPaymentHistoryCsv", () => {
  it("parses Twitch payment rows with quoted decimal commas", () => {
    const rows = parseTwitchPaymentHistoryCsv(CSV);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      amount: 157.49,
      currency: "USD",
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

  it("rejects files without the expected headers", () => {
    expect(() => parseTwitchPaymentHistoryCsv("Amount,Status\n1,Paid\n")).toThrow(
      /Missing required CSV headers/,
    );
  });
});
