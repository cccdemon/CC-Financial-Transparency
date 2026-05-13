import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { exchangeCodeForTokens, verifyOAuthState } from "@/lib/twitch";

const STATE_COOKIE = "cc-financial-twitch-oauth";

function adminUrl(path: string, req: NextRequest): URL {
  const base = process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin;
  return new URL(path, base);
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(adminUrl("/admin/login", req));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(adminUrl(`/admin/twitch?error=${encodeURIComponent(error)}`, req));
  }
  if (!code || !state) {
    return NextResponse.redirect(adminUrl("/admin/twitch?error=missing_params", req));
  }

  const store = await cookies();
  const cookieValue = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!cookieValue) {
    return NextResponse.redirect(adminUrl("/admin/twitch?error=state_missing", req));
  }
  const [storedState, signed] = cookieValue.split(".");
  if (storedState !== state || !verifyOAuthState(state, signed)) {
    return NextResponse.redirect(adminUrl("/admin/twitch?error=state_mismatch", req));
  }

  try {
    await exchangeCodeForTokens(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return NextResponse.redirect(adminUrl(`/admin/twitch?error=${encodeURIComponent(msg)}`, req));
  }

  return NextResponse.redirect(adminUrl("/admin/twitch?connected=1", req));
}
