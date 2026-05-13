"use client";

import { useMemo, useState, useTransition } from "react";

interface ParsedRow {
  amountSubmitted: string;
  paymentMethod: string;
  status: string;
  date: string;
}

interface TwitchPaymentImportFormProps {
  importAction: (formData: FormData) => void | Promise<void>;
}

export function TwitchPaymentImportForm({ importAction }: TwitchPaymentImportFormProps) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preparedCsv = useMemo(() => buildCsv(rows), [rows]);
  const hasRows = rows.length > 0;
  const missingDates = rows.some((row) => !row.date);

  async function handleFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    parseIntoRows(text);
  }

  function parseIntoRows(text: string) {
    try {
      const parsed = parseBasicTwitchCsv(text).map((row) => ({ ...row, date: "" }));
      setRows(parsed);
      setError(parsed.length === 0 ? "No payment rows found." : null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not parse CSV.");
    }
  }

  function updateDate(index: number, date: string) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, date } : row));
  }

  function submit(formData: FormData) {
    if (!hasRows || missingDates) {
      setError("Add a date for every row before importing.");
      return;
    }
    formData.set("csv", preparedCsv);
    startTransition(() => {
      void importAction(formData);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void handleFile(event.currentTarget.files?.[0] ?? null)}
          className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Or paste Twitch CSV</span>
        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.currentTarget.value)}
          onBlur={() => parseIntoRows(csvText)}
          rows={8}
          className="block w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
          placeholder={`Amount submitted,Payment method,Status\n"USD 208,97",PayPal,Bezahlt`}
        />
      </label>

      <button
        type="button"
        onClick={() => parseIntoRows(csvText)}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        Preview rows
      </button>

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {hasRows && (
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left dark:border-neutral-800">
                <th className="p-2">Date</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Method</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.amountSubmitted}-${index}`} className="border-b last:border-0 dark:border-neutral-800">
                  <td className="p-2">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(event) => updateDate(index, event.currentTarget.value)}
                      required
                      className="w-40 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                    />
                  </td>
                  <td className="p-2 tabular-nums">{row.amountSubmitted}</td>
                  <td className="p-2">{row.paymentMethod}</td>
                  <td className="p-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input type="hidden" name="csv" value={preparedCsv} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="includeSubmitted" />
        Include submitted rows that are not paid yet
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked />
        Visible on public dashboard
      </label>

      <button
        disabled={!hasRows || missingDates || isPending}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Importing..." : "Import payments"}
      </button>
    </form>
  );
}

function parseBasicTwitchCsv(input: string): Omit<ParsedRow, "date">[] {
  const records = parseCsv(input).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (records.length < 2) return [];
  const headers = records[0].map((header) => header.trim());
  const amountIndex = headers.indexOf("Amount submitted");
  const methodIndex = headers.indexOf("Payment method");
  const statusIndex = headers.indexOf("Status");
  if (amountIndex === -1 || methodIndex === -1 || statusIndex === -1) {
    throw new Error("Expected Twitch CSV headers: Amount submitted, Payment method, Status.");
  }

  return records.slice(1).map((record) => ({
    amountSubmitted: record[amountIndex]?.trim() ?? "",
    paymentMethod: record[methodIndex]?.trim() ?? "",
    status: record[statusIndex]?.trim() ?? "",
  }));
}

function buildCsv(rows: ParsedRow[]): string {
  const header = ["Date", "Amount submitted", "Payment method", "Status"];
  const body = rows.map((row) => [
    row.date,
    row.amountSubmitted,
    row.paymentMethod,
    row.status,
  ]);
  return [header, ...body].map((row) => row.map(quoteCsv).join(",")).join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
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
