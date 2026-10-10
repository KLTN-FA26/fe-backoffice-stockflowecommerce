import "server-only";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/constants/auth";

import type { NextRequest, NextResponse } from "next/server";

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value;
}
export function expireLegacyCookie(response: NextResponse): NextResponse {
  response.cookies.set(LEGACY_AUTH_COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
export function setSessionCookie(
  response: NextResponse,
  accessToken: string,
  expiresInSeconds: number,
): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, accessToken, {
    ...cookieOptions(),
    maxAge: expiresInSeconds,
  });
  return expireLegacyCookie(response);
}
export function expireSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
  return expireLegacyCookie(response);
}
