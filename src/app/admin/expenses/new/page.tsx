import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest } from "@/lib/security";
import { z } from "zod";

const expenseSourceEnum = z.enum(["giveaway", "hardware", "software", "hosting", "fees", "manual_other"]);

const schema = z.object({
  source: expenseSourceEnum,
  occurredAt: z.string().min(1),
  amount: z.coerce.number(),
  currency: z.string().default("EUR"),
  public: z.union([z.literal("on"), z.literal("")]).optional(),
  description: z.string().optional(),
  receiptUrl: z.string().optional(),
});

const allowedReceiptTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];
const maxReceiptBytes = 5_000_000;

export default async function NewExpensePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  async function create(formData: FormData) {
    "use server";
    await assertSameOriginRequest();
    const session = await getAdminSession();
    if (!session) redirect("/admin/login");

    const data = schema.parse(Object.fromEntries(formData));
    const receiptFile = formData.get("receiptFile") as File | null;
    let receiptData: Uint8Array<ArrayBuffer> | null = null;
    let receiptFileName: string | null = null;
    let receiptMimeType: string | null = null;

    if (receiptFile && receiptFile.size > 0) {
      if (!allowedReceiptTypes.includes(receiptFile.type)) {
        throw new Error("Receipt must be PDF or image.");
      }
      if (receiptFile.size > maxReceiptBytes) {
        throw new Error("Receipt file is too large.");
      }
      const buffer = await receiptFile.arrayBuffer();
      receiptData = new Uint8Array(buffer);
      receiptFileName = receiptFile.name;
      receiptMimeType = receiptFile.type || "application/octet-stream";
    }

    await db.expenseEvent.create({
      data: {
        source: data.source,
        occurredAt: new Date(data.occurredAt),
        amount: data.amount,
        currency: data.currency || "EUR",
        public: data.public === "on",
        description: data.description || null,
        receiptUrl: data.receiptUrl || null,
        receiptFileName,
        receiptMimeType,
        receiptData,
      },
    });
    redirect("/admin");
  }

  return (
    <form action={create} encType="multipart/form-data" className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">New expense</h1>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Source</span>
        <select name="source" className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          {expenseSourceEnum.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <Input name="occurredAt" type="datetime-local" label="Occurred at" required />
      <Input name="amount" type="number" step="0.01" label="Amount" required />
      <Input name="currency" type="text" label="Currency" defaultValue="EUR" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked />
        Visible on public dashboard
      </label>
      <Input name="description" type="text" label="Description" />
      <Input name="receiptUrl" type="url" label="Receipt URL (optional)" />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Receipt upload (PDF or image)</span>
        <input
          name="receiptFile"
          type="file"
          accept=".pdf,image/*"
          className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </label>
      <button className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">Save</button>
    </form>
  );
}

function Input(props: { name: string; type: string; label: string; required?: boolean; step?: string; defaultValue?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{props.label}</span>
      <input
        name={props.name}
        type={props.type}
        step={props.step}
        required={props.required}
        defaultValue={props.defaultValue}
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}
