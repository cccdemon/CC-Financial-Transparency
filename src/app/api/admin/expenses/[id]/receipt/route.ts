import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const expense = await db.expenseEvent.findUnique({ where: { id } });
  if (!expense || !expense.receiptData || !expense.receiptMimeType || !expense.receiptFileName) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(expense.receiptData, {
    headers: {
      "content-type": expense.receiptMimeType,
      "content-disposition": `attachment; filename="${expense.receiptFileName.replace(/\"/g, "")}"`,
    },
  });
}
