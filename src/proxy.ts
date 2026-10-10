/** Cookie presence is a routing hint; the BFF/backend validate the session. */

import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/constants/auth";

import { expireLegacyCookie } from "@/lib/auth/server/cookie";

import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".") // files with extensions (favicon, images, etc.)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Clear the old readable cookie on page entry, including public pages.
  const finalize = (response: NextResponse) =>
    request.cookies.has(LEGACY_AUTH_COOKIE_NAME) ? expireLegacyCookie(response) : response;

  // Skip static assets
  if (isStaticAsset(pathname)) {
    return finalize(NextResponse.next());
  }

  // Read the server-issued HttpOnly routing hint.
  const authToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = !!authToken;

  // Protected routes: /admin/*
  if (pathname.startsWith("/admin") && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return finalize(NextResponse.redirect(loginUrl));
  }

  // Already authenticated → redirect away from login
  if (isPublicPath(pathname) && isAuthenticated) {
    return finalize(NextResponse.redirect(new URL("/admin", request.url)));
  }

  return finalize(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
