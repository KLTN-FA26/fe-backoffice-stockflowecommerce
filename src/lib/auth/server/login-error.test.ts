// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/constants/auth";

import { BFF_CLIENT_IP_HEADER, VERCEL_CLIENT_IP_HEADER } from "./client-ip";
import { loginHandler } from "./handlers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: false }));

const origin = "https://backoffice.example.com";
const backendMessage = "Invalid username or password";
const fetchMock = vi.fn<typeof fetch>();
// Spring ApiResponse failure envelope (common/api/ApiResponse.java).
const springError = (status: number, errorCode: string, headers: Record<string, string> = {}) =>
  Response.json(
    { success: false, errorCode, message: backendMessage, correlationId: "corr-1" },
    { status, headers },
  );
function login(cookie = `${AUTH_COOKIE_NAME}=stale; ${LEGACY_AUTH_COOKIE_NAME}=legacy`) {
  return loginHandler(
    new NextRequest(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7",
      },
      body: JSON.stringify({ username: "staff", password: "secret" }),
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://backend.example.com/api/v1");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("BFF_ORIGIN_SECRET", "test-only-bff-origin-secret-placeholder");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("login failure keeps only allow-listed backend codes", () => {
  it.each([
    [401, "UNAUTHORIZED"],
    [403, "ACCOUNT_NOT_ACTIVE"],
    [403, "ACCOUNT_TEMPORARILY_LOCKED"],
    [429, "RATE_LIMITED"],
  ])("%i %s keeps code and status, no session, stale cookies expired", async (status, code) => {
    fetchMock.mockResolvedValueOnce(springError(status, code));
    const response = await login();
    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code });
    expect(JSON.stringify(body)).not.toContain(backendMessage);
    expect(JSON.stringify(body)).not.toContain("corr-1");
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get(LEGACY_AUTH_COOKIE_NAME)?.maxAge).toBe(0);
    // Only the login call: no /me bootstrap after a failure.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    ["unknown 403", springError(403, "SOME_FUTURE_INTERNAL_CODE"), 403],
    ["500", springError(500, "INTERNAL_ERROR"), 500],
    ["non-login code", springError(403, "PRIVILEGE_ESCALATION"), 403],
    ["HTML gateway page", new Response("<html>502 Bad Gateway</html>", { status: 502 }), 502],
    ["malformed JSON", new Response("{not json", { status: 401 }), 401],
    [
      "missing code",
      Response.json({ success: false, message: backendMessage }, { status: 403 }),
      403,
    ],
    [
      "non-string code",
      Response.json({ errorCode: { name: "UNAUTHORIZED" } }, { status: 401 }),
      401,
    ],
    ["array body", Response.json(["UNAUTHORIZED"], { status: 401 }), 401],
  ])("%s becomes generic LOGIN_FAILED with original status", async (_name, upstream, status) => {
    fetchMock.mockResolvedValueOnce(upstream);
    const response = await login();
    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: "LOGIN_FAILED" });
    expect(JSON.stringify(body)).not.toContain(backendMessage);
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toMatchObject({ value: "", maxAge: 0 });
  });
  it("legacy field `code` is not trusted as the backend contract", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));
    expect(await (await login()).json()).toMatchObject({ code: "LOGIN_FAILED" });
  });
  it("429 forwards a whole-second Retry-After, and nothing else from upstream", async () => {
    fetchMock.mockResolvedValueOnce(
      springError(429, "RATE_LIMITED", { "Retry-After": "42", "X-Internal": "node-7" }),
    );
    const response = await login();
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.has("X-Internal")).toBe(false);
  });
  it.each(["Wed, 21 Oct 2026 07:28:00 GMT", "-1", "42, 43", "1e3"])(
    "unsafe Retry-After %j is dropped",
    async (value) => {
      fetchMock.mockResolvedValueOnce(springError(429, "RATE_LIMITED", { "Retry-After": value }));
      expect((await login()).headers.has("Retry-After")).toBe(false);
    },
  );
  it("Retry-After is only forwarded for 429", async () => {
    fetchMock.mockResolvedValueOnce(
      springError(403, "ACCOUNT_TEMPORARILY_LOCKED", { "Retry-After": "60" }),
    );
    expect((await login()).headers.has("Retry-After")).toBe(false);
  });
  it("the Spring login call still carries the trusted client IP", async () => {
    fetchMock.mockResolvedValueOnce(springError(401, "UNAUTHORIZED"));
    await login();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get(BFF_CLIENT_IP_HEADER)).toBe(
      "203.0.113.7",
    );
  });
});
