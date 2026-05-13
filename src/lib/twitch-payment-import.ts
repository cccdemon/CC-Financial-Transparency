import { createHash } from "node:crypto";

export type TwitchPaymentStatus = "paid" | "submitted" | "other";

export interface TwitchPaymentImportRow {
  amount: number;
  currency: string;
  occurredAt: Date | null;
  paymentMethod: string;
  rawStatus: string;
  status: TwitchPaymentStatus;
  externalId: string;
  legacyExternalId: string;
}

const REQUIRED_HEADERS = ["Amount submitted", "Payment method", "Status"] as const;
const DATE_HEADERS = [
  "Date",
  "Approval date",
  "Approved at",
  "Genehmigungsdatum",
  "Month",
  "Monat",
] as const;

export function parseTwitchPaymentHistoryCsv(input: string): TwitchPaymentImportRow[] {
  const germanRows = parseGermanPaymentHistoryText(input);
  if (germanRows) return germanRows;

  const records = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (records.length < 2) return [];

  const headers = records[0].map((h) => h.trim());
  const indexes = REQUIRED_HEADERS.map((header) => headers.indexOf(header));
  if (indexes.some((index) => index === -1)) {
    throw new Error(`Missing required CSV headers: ${REQUIRED_HEADERS.join(", ")}`);
  }

  const [amountIndex, methodIndex, statusIndex] = indexes;
  const dateIndex = DATE_HEADERS
    .map((header) => headers.indexOf(header))
    .find((index) => index !== -1);
  const seen = new Map<string, number>();

  return records.slice(1).map((record, rowIndex) => {
    const amountText = record[amountIndex]?.trim() ?? "";
    const paymentMethod = record[methodIndex]?.trim() ?? "";
    const rawStatus = record[statusIndex]?.trim() ?? "";
    const { amount, currency } = parseAmount(amountText, rowIndex + 2);
    const occurredAt = dateIndex === undefined
      ? null
      : parseFlexibleDate(record[dateIndex]?.trim() ?? "", rowIndex + 2);
    const status = normalizeStatus(rawStatus);
    const normalized = normalizeIdentity({ amount, currency, paymentMethod, rawStatus });
    const occurrence = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, occurrence);
    const legacyExternalId = externalIdFor(`${normalized}|${occurrence}`);
    const externalId = occurredAt
      ? externalIdFor(`${occurredAt.toISOString().slice(0, 10)}|${normalized}|${occurrence}`)
      : legacyExternalId;

    return {
      amount,
      currency,
      occurredAt,
      paymentMethod,
      rawStatus,
      status,
      externalId,
      legacyExternalId,
    };
  });
}

function parseGermanPaymentHistoryText(input: string): TwitchPaymentImportRow[] | null {
  if (!input.includes("Genehmigungsdatum") || !input.includes("Bezahlter Betrag")) {
    return null;
  }

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "Bestätigung herunterladen");
  const rows: TwitchPaymentImportRow[] = [];
  const seen = new Map<string, number>();
  for (let i = lines.findIndex((line) => isGermanDate(line)); i >= 0 && i < lines.length;) {
    const dateText = lines[i];
    const amountText = lines[i + 1];
    const paymentMethod = lines[i + 2] ?? "";
    const rawStatus = lines[i + 3] ?? "";
    if (!amountText || !paymentMethod || !rawStatus) break;

    const occurredAt = parseGermanDate(dateText);
    const { amount, currency } = parseAmount(amountText, i + 1);
    const status = normalizeStatus(rawStatus);
    const normalized = normalizeIdentity({ amount, currency, paymentMethod, rawStatus });
    const occurrence = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, occurrence);
    const legacyExternalId = externalIdFor(`${normalized}|${occurrence}`);
    const datedIdentity = `${occurredAt.toISOString().slice(0, 10)}|${normalized}|${occurrence}`;

    rows.push({
      amount,
      currency,
      occurredAt,
      paymentMethod,
      rawStatus,
      status,
      externalId: externalIdFor(datedIdentity),
      legacyExternalId,
    });

    const nextDate = lines.findIndex((line, index) => index > i && isGermanDate(line));
    i = nextDate;
  }

  return rows;
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

const GERMAN_MONTHS: Record<string, number> = {
  januar: 0,
  februar: 1,
  maerz: 2,
  "märz": 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
};

function isGermanDate(value: string): boolean {
  return /^\d{1,2}\s+\p{L}+\s+\d{4}$/u.test(value.trim());
}

function parseGermanDate(value: string): Date {
  const match = value.trim().match(/^(\d{1,2})\s+(\p{L}+)\s+(\d{4})$/u);
  if (!match) throw new Error(`Invalid approval date: ${value}`);
  const day = Number(match[1]);
  const month = GERMAN_MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) {
    throw new Error(`Invalid approval date: ${value}`);
  }
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function parseFlexibleDate(value: string, rowNumber: number): Date | null {
  if (!value) return null;
  if (isGermanDate(value)) return parseGermanDate(value);

  const monthMatch = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (monthMatch) {
    return new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1, 12, 0, 0));
  }

  const isoDateMatch = value.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (isoDateMatch) {
    return new Date(Date.UTC(
      Number(isoDateMatch[1]),
      Number(isoDateMatch[2]) - 1,
      Number(isoDateMatch[3]),
      12,
      0,
      0,
    ));
  }

  throw new Error(`Invalid date in row ${rowNumber}: ${value}`);
}

function normalizeStatus(value: string): TwitchPaymentStatus {
  const v = value.trim().toLowerCase();
  if (v === "bezahlt" || v === "paid") return "paid";
  if (v === "eingereicht" || v === "submitted") return "submitted";
  return "other";
}

function normalizeIdentity(input: {
  amount: number;
  currency: string;
  paymentMethod: string;
  rawStatus: string;
}): string {
  return [
    input.currency,
    input.amount.toFixed(2),
    input.paymentMethod.toLowerCase(),
    input.rawStatus.toLowerCase(),
  ].join("|");
}

function externalIdFor(value: string): string {
  return `twitch-payment-history:${hash(value)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
