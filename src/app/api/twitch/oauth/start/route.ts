import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { buildOAuthAuthorizeUrl, newOAuthState } from "@/lib/twitch";

const STATE_COOKIE = "cc-financial-twitch-oauth";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { state, signed } = newOAuthState();
  const store = await cookies();
  store.set(STATE_COOKIE, `${state}.${signed}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/twitch/oauth",
  });

  const url = buildOAuthAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
