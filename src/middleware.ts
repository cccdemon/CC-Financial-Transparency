import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cc-financial-admin";

export const config = {
  matcher: ["/admin/:path*"],
};

// Lightweight middleware — only checks cookie presence to avoid running
// crypto verification under the Edge runtime. Each admin route/page server
// component must re-verify the cookie via getAdminSession() before performing
// any privileged action.
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasCookie = Boolean(request.cookies.get(COOKIE_NAME)?.value);
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
