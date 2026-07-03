import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { generateYearEndExport } from "../src/lib/year-end-export";

async function main() {
  const yearArg = process.argv[2];
  const year = yearArg ? Number(yearArg) : new Date().getUTCFullYear() - 1;
  if (Number.isNaN(year) || year < 2000 || year > 3000) {
    throw new Error("Please provide a valid year, e.g. 2026.");
  }

  // Freeze the snapshot in the database (source of truth for the admin UI)...
  const record = await generateYearEndExport(year, { auto: true });

  // ...and also drop a filesystem copy for backup / offline archiving.
  const exportDir = path.resolve(process.cwd(), "exports");
  await fs.mkdir(exportDir, { recursive: true });

  const pdfPath = path.join(exportDir, `gewinn-verlust-${year}.pdf`);
  await fs.writeFile(pdfPath, record.pdfData);

  const csvPath = path.join(exportDir, `gewinn-verlust-${year}.csv`);
  await fs.writeFile(csvPath, record.csvData);

  console.log(`Jahresabschluss ${year} in DB gespeichert (id ${record.id}).`);
  console.log(`PDF exportiert: ${pdfPath}`);
  console.log(`CSV exportiert: ${csvPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
