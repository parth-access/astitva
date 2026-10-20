import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Sends signed-out visitors of /admin straight to the login page. This only
 * checks that a session cookie exists; requireAdmin() on every page and
 * action is the real check.
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/verify", "/admin/forgot-password", "/admin/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
