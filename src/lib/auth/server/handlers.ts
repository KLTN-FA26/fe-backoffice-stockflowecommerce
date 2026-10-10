import "server-only";

import { NextResponse } from "next/server";

import { authUserSchema, loginRequestSchema } from "@/lib/auth/auth-schemas";

import { BACKEND_AUTH_PATHS, backendFetch, backendTokensSchema, unwrapBackend } from "./backend";
import { loginClientIpHeaders } from "./client-ip";
import { readLoginFailure } from "./login-error";
import {
  expireLegacyCookie,
  expireSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "./cookie";

import type { NextRequest } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };
export const bffError = (status: number, code: string) =>
  NextResponse.json(
    { code, message: "Không thể hoàn tất yêu cầu." },
    { status, headers: NO_STORE },
  );
// A configured canonical origin supports reverse proxies without trusting forwarded headers.
// Without it, use Next's request origin; the ingress must enforce the canonical Host.
export function isSameOrigin(request: NextRequest): boolean {
  try {
    const origin = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN)
      : new URL(request.nextUrl.origin);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return false;
    return (
      request.headers.get("Origin") === origin.origin &&
      request.headers.get("Sec-Fetch-Site") !== "cross-site"
    );
  } catch {
    return false;
  }
}
const bearer = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});
const safeUser = async (response: Response, token: string) => {
  const user = authUserSchema.parse(await unwrapBackend(response));
  if (JSON.stringify(user).includes(token)) throw new Error("Invalid profile response");
  return user;
};

export async function loginHandler(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return bffError(403, "CSRF_REJECTED");
  let accessToken: string | undefined;
  try {
    const credentials = loginRequestSchema.safeParse(await request.json());
    if (!credentials.success) return bffError(400, "INVALID_CREDENTIALS");
    const login = await backendFetch(BACKEND_AUTH_PATHS.login, {
      method: "POST",
      headers: {
        ...loginClientIpHeaders(request.headers),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(credentials.data),
    });
    if (!login.ok) {
      const { code, retryAfter } = await readLoginFailure(login);
      const failure = bffError(login.status, code);
      if (retryAfter) failure.headers.set("Retry-After", retryAfter);
      return expireSessionCookie(failure);
    }
    const tokens = backendTokensSchema.parse(await unwrapBackend(login));
    accessToken = tokens.accessToken;
    const me = await backendFetch(BACKEND_AUTH_PATHS.me, {
      method: "GET",
      headers: bearer(accessToken),
    });
    if (!me.ok) {
      const failure = expireSessionCookie(bffError(me.status, "SESSION_BOOTSTRAP_FAILED"));
      try {
        await backendFetch(BACKEND_AUTH_PATHS.logout, {
          method: "POST",
          headers: bearer(accessToken),
        });
      } catch {
        /* Cleanup never masks the original failure. */
      }
      return failure;
    }
    const user = await safeUser(me, accessToken);
    return setSessionCookie(
      NextResponse.json(user, { headers: NO_STORE }),
      accessToken,
      tokens.expiresInSeconds,
    );
  } catch {
    if (accessToken) {
      try {
        await backendFetch(BACKEND_AUTH_PATHS.logout, {
          method: "POST",
          headers: bearer(accessToken),
        });
      } catch {
        /* Best-effort session revocation. */
      }
    }
    return expireSessionCookie(bffError(502, "AUTH_UPSTREAM_FAILURE"));
  }
}
export async function meHandler(request: NextRequest): Promise<NextResponse> {
  const token = readSessionToken(request);
  if (!token) return expireSessionCookie(bffError(401, "UNAUTHENTICATED"));
  try {
    const me = await backendFetch(BACKEND_AUTH_PATHS.me, { method: "GET", headers: bearer(token) });
    if (!me.ok) {
      const error = bffError(me.status, "SESSION_BOOTSTRAP_FAILED");
      return me.status === 401 ? expireSessionCookie(error) : expireLegacyCookie(error);
    }
    return expireLegacyCookie(NextResponse.json(await safeUser(me, token), { headers: NO_STORE }));
  } catch {
    return expireLegacyCookie(bffError(502, "AUTH_UPSTREAM_FAILURE"));
  }
}
export async function logoutHandler(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return bffError(403, "CSRF_REJECTED");
  const token = readSessionToken(request);
  try {
    if (token)
      await backendFetch(BACKEND_AUTH_PATHS.logout, { method: "POST", headers: bearer(token) });
  } catch {
    /* Local session removal still succeeds if Spring is unavailable. */
  }
  return expireSessionCookie(new NextResponse(null, { status: 204, headers: NO_STORE }));
}

const SAFE_REQUEST_HEADERS = ["Content-Type", "Accept", "X-Warehouse-Id"] as const;
const SAFE_RESPONSE_HEADERS = ["Content-Type", "Content-Disposition"] as const;
// Check parsed JSON too, so escaped property names/strings cannot bypass filtering.
function containsCredential(value: unknown, token: string): boolean {
  if (typeof value === "string") return value.includes(token);
  if (Array.isArray(value)) return value.some((item: unknown) => containsCredential(item, token));
  if (typeof value === "object" && value !== null)
    return Object.entries(value).some(
      ([key, item]) =>
        /^(?:access.?token|refresh.?token)$/i.test(key) || containsCredential(item, token),
    );
  return false;
}
export async function backendProxyHandler(
  request: NextRequest,
  paths: string[],
): Promise<NextResponse> {
  if (!["GET", "HEAD"].includes(request.method) && !isSameOrigin(request))
    return bffError(403, "CSRF_REJECTED");
  if (
    !paths.length ||
    paths.some((part) => !/^[a-zA-Z0-9_@+.-]+$/.test(part) || part === "." || part === "..") ||
    paths.slice(0, 2).join("/").toLowerCase() === "identity/auth"
  )
    return bffError(400, "INVALID_BACKEND_PATH");
  const token = readSessionToken(request);
  if (!token) return expireSessionCookie(bffError(401, "UNAUTHENTICATED"));
  let upstreamStatus: number | undefined;
  try {
    const headers = new Headers();
    for (const name of SAFE_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("Authorization", `Bearer ${token}`);
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    const upstream = await backendFetch(
      paths.map(encodeURIComponent).join("/"),
      { method: request.method, headers, body },
      request.nextUrl.search,
    );
    upstreamStatus = upstream.status;
    const responseHeaders = new Headers(NO_STORE);
    for (const name of SAFE_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value && !value.includes(token)) responseHeaders.set(name, value);
    }
    // Do not forward Set-Cookie, Location, hop-by-hop headers or token-bearing bodies.
    const bytes =
      request.method === "HEAD" || [204, 205, 304].includes(upstream.status)
        ? null
        : await upstream.arrayBuffer();
    if (bytes) {
      const text = new TextDecoder().decode(bytes);
      let unsafe = text.includes(token);
      try {
        unsafe ||= containsCredential(JSON.parse(text), token);
      } catch {
        /* Non-JSON responses retain their content type. */
      }
      if (unsafe) {
        const failure = bffError(upstream.status === 401 ? 401 : 502, "UNSAFE_UPSTREAM_RESPONSE");
        return upstream.status === 401 ? expireSessionCookie(failure) : failure;
      }
    }
    const response = new NextResponse(bytes, { status: upstream.status, headers: responseHeaders });
    return upstream.status === 401 ? expireSessionCookie(response) : expireLegacyCookie(response);
  } catch {
    const failure = bffError(upstreamStatus === 401 ? 401 : 502, "BACKEND_UNAVAILABLE");
    return upstreamStatus === 401 ? expireSessionCookie(failure) : failure;
  }
}
