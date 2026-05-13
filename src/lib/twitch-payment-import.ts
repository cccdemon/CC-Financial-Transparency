import { createHash } from "node:crypto";

export type TwitchPaymentStatus = "paid" | "submitted" | "other";

export interface TwitchPaymentImportRow {
  amount: number;
  currency: string;
  paymentMethod: string;
  rawStatus: string;
  status: TwitchPaymentStatus;
  externalId: string;
}

const REQUIRED_HEADERS = ["Amount submitted", "Payment method", "Status"] as const;

export function parseTwitchPaymentHistoryCsv(input: string): TwitchPaymentImportRow[] {
  const records = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (records.length < 2) return [];

  const headers = records[0].map((h) => h.trim());
  const indexes = REQUIRED_HEADERS.map((header) => headers.indexOf(header));
  if (indexes.some((index) => index === -1)) {
    throw new Error(`Missing required CSV headers: ${REQUIRED_HEADERS.join(", ")}`);
  }

  const [amountIndex, methodIndex, statusIndex] = indexes;
  const seen = new Map<string, number>();

  return records.slice(1).map((record, rowIndex) => {
    const amountText = record[amountIndex]?.trim() ?? "";
    const paymentMethod = record[methodIndex]?.trim() ?? "";
    const rawStatus = record[statusIndex]?.trim() ?? "";
    const { amount, currency } = parseAmount(amountText, rowIndex + 2);
    const status = normalizeStatus(rawStatus);
    const normalized = [
      currency,
      amount.toFixed(2),
      paymentMethod.toLowerCase(),
      rawStatus.toLowerCase(),
    ].join("|");
    const occurrence = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, occurrence);

    return {
      amount,
      currency,
      paymentMethod,
      rawStatus,
      status,
      externalId: `twitch-payment-history:${hash(`${normalized}|${occurrence}`)}`,
    };
  });
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function parseAmount(value: string, rowNumber: number): { amount: number; currency: string } {
  const match = value.match(/^([A-Z]{3})\s+([0-9.,]+)$/);
  if (!match) {
    throw new Error(`Invalid amount in row ${rowNumber}: ${value}`);
  }

  const amount = Number(match[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount in row ${rowNumber}: ${value}`);
  }

  return { amount, currency: match[1] };
}

function normalizeStatus(value: string): TwitchPaymentStatus {
  const v = value.trim().toLowerCase();
  if (v === "bezahlt" || v === "paid") return "paid";
  if (v === "eingereicht" || v === "submitted") return "submitted";
  return "other";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
