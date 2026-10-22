import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Sends signed-out visitors of /admin to the admin login, and of /account to
 * the customer sign-in. This only checks that a session cookie exists;
 * requireAdmin() and requireCustomer() on every page and action are the real checks.
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/verify", "/admin/forgot-password", "/admin/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    if (pathname === "/account/sign-in" || getSessionCookie(request, { cookiePrefix: "astitva" })) return NextResponse.next();
    const signIn = new URL("/account/sign-in", request.url);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/account", "/account/:path*"],
};
