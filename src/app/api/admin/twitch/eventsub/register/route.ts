import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { assertSameOriginRequest } from "@/lib/security";
import {
  createEventSubSubscription,
  defaultSubscriptionPlans,
  listEventSubSubscriptions,
} from "@/lib/twitch";

export async function POST() {
  await assertSameOriginRequest();
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;
  if (!broadcasterId) {
    return NextResponse.redirect(
      new URL("/admin/twitch?error=broadcaster_id_missing", process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"),
    );
  }

  const existing = await listEventSubSubscriptions();
  const existingTypes = new Set(existing.map((s) => s.type));
  const plans = defaultSubscriptionPlans(broadcasterId);

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: { type: string; error: string }[] = [];

  for (const plan of plans) {
    if (existingTypes.has(plan.type)) {
      skipped.push(plan.type);
      continue;
    }
    try {
      await createEventSubSubscription(plan);
      created.push(plan.type);
    } catch (e) {
      errors.push({ type: plan.type, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  const params = new URLSearchParams();
  params.set("created", created.join(","));
  params.set("skipped", skipped.join(","));
  if (errors.length) params.set("errors", encodeURIComponent(JSON.stringify(errors)));

  return NextResponse.redirect(
    new URL(`/admin/twitch?${params.toString()}`, process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"),
  );
}
