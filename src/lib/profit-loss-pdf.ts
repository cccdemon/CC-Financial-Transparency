import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { ProfitLossLine, ProfitLossReport } from "./profit-loss";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LINE_HEIGHT = 14;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.2, 0.2, 0.2);

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

// pdf-lib's StandardFonts (WinAnsi) cannot encode every UTF-8 char (e.g. some
// dashes/emoji). Strip anything outside the WinAnsi-safe range so drawText never throws.
function sanitize(value: string): string {
  return value.replace(/[^\x20-\xFF]/g, "");
}

// Trim a string until it fits within maxWidth at the given size.
function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let out = sanitize(text);
  while (out.length > 1 && font.widthOfTextAtSize(out, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out;
}

export async function buildProfitLossPdf(report: ProfitLossReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = page.getHeight() - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = page.getHeight() - MARGIN;
  };
  // Ensure at least `needed` vertical space remains, else start a new page.
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };
  const text = (
    value: string,
    x: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => {
    page.drawText(sanitize(value), { x, y, size, font: f, color });
  };

  // Title block
  text("Gewinn- und Verlustrechnung", MARGIN, 18, bold);
  y -= 28;
  text(`Jahr: ${report.year}`, MARGIN, 11, font, MUTED);
  y -= 16;
  text(`Erstellt: ${new Date(report.generatedAt).toLocaleDateString("de-DE")}`, MARGIN, 10, font, MUTED);

  // Summary
  y -= 26;
  text("Zusammenfassung", MARGIN, 14, bold);
  y -= 18;
  const summary: Array<[string, string]> = [
    ["Betriebseinnahmen", formatCurrency(report.incomeTotal, report.currency)],
    ["Betriebsausgaben", formatCurrency(report.expenseTotal, report.currency)],
    [report.profit >= 0 ? "Gewinn" : "Verlust", formatCurrency(report.profit, report.currency)],
  ];
  for (const [label, value] of summary) {
    text(label, MARGIN, 11, font, rgb(0.15, 0.15, 0.15));
    text(value, PAGE_WIDTH - MARGIN - 150, 11, font);
    y -= LINE_HEIGHT;
  }

  // Monthly overview
  y -= 18;
  ensure(LINE_HEIGHT * 3);
  text("Monatsübersicht", MARGIN, 14, bold);
  y -= 18;
  const monthCols = [MARGIN, MARGIN + 120, MARGIN + 240, MARGIN + 360];
  const drawMonthHeader = () => {
    text("Monat", monthCols[0], 10, bold);
    text("Einnahmen", monthCols[1], 10, bold);
    text("Ausgaben", monthCols[2], 10, bold);
    text("Ergebnis", monthCols[3], 10, bold);
    y -= LINE_HEIGHT;
  };
  drawMonthHeader();
  for (const row of report.monthly) {
    if (y - LINE_HEIGHT < MARGIN) {
      newPage();
      drawMonthHeader();
    }
    text(row.period, monthCols[0], 10);
    text(formatCurrency(row.income, report.currency), monthCols[1], 10);
    text(formatCurrency(row.expenses, report.currency), monthCols[2], 10);
    text(formatCurrency(row.profit, report.currency), monthCols[3], 10);
    y -= LINE_HEIGHT;
  }

  // Detail sections — render ALL rows (no truncation), paginated.
  const detailCols = { date: MARGIN, category: MARGIN + 90, description: MARGIN + 190, amount: MARGIN + 420 };
  const amountRightEdge = PAGE_WIDTH - MARGIN;

  const drawDetailHeader = () => {
    text("Datum", detailCols.date, 10, bold);
    text("Kategorie", detailCols.category, 10, bold);
    text("Beschreibung", detailCols.description, 10, bold);
    const amountLabel = "Betrag";
    text(amountLabel, amountRightEdge - bold.widthOfTextAtSize(amountLabel, 10), 10, bold);
    y -= LINE_HEIGHT;
  };

  const renderSection = (title: string, rows: ProfitLossLine[], total: number) => {
    y -= 20;
    ensure(LINE_HEIGHT * 3);
    text(`${title} (${rows.length})`, MARGIN, 14, bold);
    y -= 18;
    drawDetailHeader();
    for (const line of rows) {
      if (y - LINE_HEIGHT < MARGIN) {
        newPage();
        drawDetailHeader();
      }
      text(line.date, detailCols.date, 9);
      text(fit(font, line.category, 9, 90), detailCols.category, 9);
      text(fit(font, line.description, 9, detailCols.amount - detailCols.description - 6), detailCols.description, 9);
      const amount = formatCurrency(line.amount, line.currency || report.currency);
      text(amount, amountRightEdge - font.widthOfTextAtSize(sanitize(amount), 9), 9);
      y -= LINE_HEIGHT;
    }
    if (y - LINE_HEIGHT < MARGIN) newPage();
    const totalStr = formatCurrency(total, report.currency);
    text("Summe", detailCols.description, 10, bold);
    text(totalStr, amountRightEdge - bold.widthOfTextAtSize(sanitize(totalStr), 10), 10, bold);
    y -= LINE_HEIGHT;
  };

  renderSection("Betriebseinnahmen", report.incomeLines, report.incomeTotal);
  renderSection("Betriebsausgaben", report.expenseLines, report.expenseTotal);

  return doc.save();
}
