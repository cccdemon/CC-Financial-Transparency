import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { exchangeCodeForTokens, verifyOAuthState } from "@/lib/twitch";

const STATE_COOKIE = "cc-financial-twitch-oauth";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin/twitch?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/twitch?error=missing_params", req.url));
  }

  const store = await cookies();
  const cookieValue = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!cookieValue) {
    return NextResponse.redirect(new URL("/admin/twitch?error=state_missing", req.url));
  }
  const [storedState, signed] = cookieValue.split(".");
  if (storedState !== state || !verifyOAuthState(state, signed)) {
    return NextResponse.redirect(new URL("/admin/twitch?error=state_mismatch", req.url));
  }

  try {
    await exchangeCodeForTokens(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return NextResponse.redirect(new URL(`/admin/twitch?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL("/admin/twitch?connected=1", req.url));
}
