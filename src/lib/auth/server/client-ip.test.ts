// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME } from "@/constants/auth";

import {
  BFF_CLIENT_IP_HEADER,
  BFF_SECRET_HEADER,
  VERCEL_CLIENT_IP_HEADER,
  loginClientIpHeaders,
  trustedClientIp,
} from "./client-ip";
import { backendProxyHandler, loginHandler } from "./handlers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: false }));

// Test-only placeholder, never a deployed value.
const secret = "test-only-bff-origin-secret-placeholder";
const credential = "server-session-fixture";
const origin = "https://backoffice.example.com";
const user = {
  userId: "staff",
  username: "staff",
  email: "staff@example.com",
  fullName: null,
  status: "ACTIVE",
  roles: [],
  lastLoginAt: null,
};
const fetchMock = vi.fn<typeof fetch>();
const envelope = (data: unknown) => Response.json({ success: true, data });
const upstreamHeaders = (call = 0) => new Headers(fetchMock.mock.calls[call][1]?.headers);

function loginRequest(extra: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: JSON.stringify({ username: "staff", password: "secret" }),
  });
}
function mockSuccessfulLogin() {
  fetchMock
    .mockResolvedValueOnce(
      envelope({ accessToken: credential, tokenType: "Bearer", expiresInSeconds: 1234 }),
    )
    .mockResolvedValueOnce(envelope(user));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://backend.example.com/api/v1");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  vi.stubEnv("BFF_ORIGIN_SECRET", "");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("trusted client IP source", () => {
  it.each(["203.0.113.7", "2001:db8::1"])("Vercel: accepts single address %s", (ip) => {
    vi.stubEnv("VERCEL", "1");
    expect(trustedClientIp(new Headers({ [VERCEL_CLIENT_IP_HEADER]: ip }))).toBe(ip);
  });
  it("Vercel: browser X-Forwarded-For / X-Real-IP are never the source", () => {
    vi.stubEnv("VERCEL", "1");
    const headers = new Headers({ "X-Forwarded-For": "198.51.100.9", "X-Real-IP": "198.51.100.9" });
    expect(trustedClientIp(headers)).toBeUndefined();
    headers.set(VERCEL_CLIENT_IP_HEADER, "203.0.113.7");
    expect(trustedClientIp(headers)).toBe("203.0.113.7");
  });
  it.each([
    "203.0.113.7, 198.51.100.9",
    "203.0.113.7,198.51.100.9",
    "garbage",
    "backoffice.example.com",
    "203.0.113.7:443",
    "[2001:db8::1]",
    "fe80::1%eth0",
    "999.1.1.1",
    "",
  ])("Vercel: rejects invalid or multi-hop value %j instead of picking an entry", (value) => {
    vi.stubEnv("VERCEL", "1");
    expect(trustedClientIp(new Headers({ [VERCEL_CLIENT_IP_HEADER]: value }))).toBeUndefined();
  });
  it("non-Vercel: only an explicitly configured ingress header is trusted", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    const headers = new Headers({ "X-Real-IP": "203.0.113.7", "X-Forwarded-For": "198.51.100.9" });
    expect(trustedClientIp(headers)).toBe("203.0.113.7");
    // Vercel's header means nothing off Vercel.
    expect(trustedClientIp(new Headers({ [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7" }))).toBe(
      undefined,
    );
  });
  it("no Vercel and no configured ingress: nothing is trusted, so nothing is forwarded", () => {
    const headers = new Headers({
      "X-Forwarded-For": "198.51.100.9",
      "X-Real-IP": "198.51.100.9",
      [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7",
    });
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    expect(trustedClientIp(headers)).toBeUndefined();
    expect(loginClientIpHeaders(headers)).toEqual({});
  });
  it.each(["", "too-short", `${secret} with-space`])(
    "unusable BFF secret %j keeps the nginx trust path off",
    (value) => {
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("BFF_ORIGIN_SECRET", value);
      const result = loginClientIpHeaders(
        new Headers({ [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7" }),
      );
      expect(result).not.toHaveProperty(BFF_SECRET_HEADER);
      expect(result).not.toHaveProperty(BFF_CLIENT_IP_HEADER);
    },
  );
});

describe("login forwards a server-generated rate-limit identity", () => {
  it("upstream login gets the validated IP and the BFF secret; the response never carries it", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    mockSuccessfulLogin();
    const response = await loginHandler(
      loginRequest({ [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7", "X-Forwarded-For": "198.51.100.9" }),
    );
    expect(response.status).toBe(200);
    const login = upstreamHeaders(0);
    expect(login.get(BFF_CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(login.get(BFF_SECRET_HEADER)).toBe(secret);
    expect(login.get("X-Forwarded-For")).toBe("203.0.113.7");
    expect(login.get("X-Real-IP")).toBe("203.0.113.7");
    // Only the login call carries the identity; /me is a token-authenticated call.
    expect(upstreamHeaders(1).has(BFF_SECRET_HEADER)).toBe(false);
    const body = await response.text();
    expect(body).not.toContain(secret);
    expect([...response.headers.values()].join("\n")).not.toContain(secret);
  });
  it("browser cannot inject or override the client IP or the secret", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    mockSuccessfulLogin();
    await loginHandler(
      loginRequest({
        [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7",
        [BFF_CLIENT_IP_HEADER]: "1.2.3.4",
        [BFF_SECRET_HEADER]: "attacker-guess",
      }),
    );
    expect(upstreamHeaders(0).get(BFF_CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(upstreamHeaders(0).get(BFF_SECRET_HEADER)).toBe(secret);
  });
  it("without a trusted source, browser-supplied identity headers never reach Spring", async () => {
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    mockSuccessfulLogin();
    await loginHandler(
      loginRequest({
        "X-Forwarded-For": "198.51.100.9",
        "X-Real-IP": "198.51.100.9",
        [BFF_CLIENT_IP_HEADER]: "1.2.3.4",
        [BFF_SECRET_HEADER]: secret,
      }),
    );
    const login = upstreamHeaders(0);
    for (const name of ["X-Forwarded-For", "X-Real-IP", BFF_CLIENT_IP_HEADER, BFF_SECRET_HEADER])
      expect(login.has(name)).toBe(false);
  });
  it("invalid platform IP is omitted, login still proceeds", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    mockSuccessfulLogin();
    const response = await loginHandler(
      loginRequest({ [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7, 198.51.100.9" }),
    );
    expect(response.status).toBe(200);
    expect(upstreamHeaders(0).has(BFF_CLIENT_IP_HEADER)).toBe(false);
    expect(upstreamHeaders(0).has(BFF_SECRET_HEADER)).toBe(false);
  });
  it("generic /api/backend/* never forwards the internal or forwarding headers", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BFF_ORIGIN_SECRET", secret);
    fetchMock.mockResolvedValue(Response.json({ items: [] }));
    await backendProxyHandler(
      new NextRequest(`${origin}/api/backend/products`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${credential}`,
          [VERCEL_CLIENT_IP_HEADER]: "203.0.113.7",
          "X-Forwarded-For": "198.51.100.9",
          "X-Real-IP": "198.51.100.9",
          [BFF_CLIENT_IP_HEADER]: "1.2.3.4",
          [BFF_SECRET_HEADER]: secret,
        },
      }),
      ["products"],
    );
    const proxied = upstreamHeaders(0);
    for (const name of ["X-Forwarded-For", "X-Real-IP", BFF_CLIENT_IP_HEADER, BFF_SECRET_HEADER])
      expect(proxied.has(name)).toBe(false);
  });
});
