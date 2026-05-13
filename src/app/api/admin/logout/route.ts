import { NextResponse } from "next/server";
import { endAdminSession } from "@/lib/auth";

export async function POST() {
  await endAdminSession();
  return NextResponse.redirect(new URL("/admin/login", process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"));
}
