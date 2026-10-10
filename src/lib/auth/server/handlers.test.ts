// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/constants/auth";

import {
  backendProxyHandler,
  isSameOrigin,
  loginHandler,
  logoutHandler,
  meHandler,
} from "./handlers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: false }));
const credential = "server-session-fixture";
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
const origin = "https://backoffice.example.com";
function request(path: string, method = "GET", body?: string, extra: Record<string, string> = {}) {
  return new NextRequest(origin + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: `${AUTH_COOKIE_NAME}=${credential}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body,
  });
}
const envelope = (data: unknown) => Response.json({ success: true, data });
const expectExpired = (response: Awaited<ReturnType<typeof meHandler>>) => {
  expect(response.cookies.get(AUTH_COOKIE_NAME)).toMatchObject({
    value: "",
    maxAge: 0,
    httpOnly: true,
  });
};
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://backend.example.com/api/v1");
  vi.stubEnv("APP_ORIGIN", "");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-only auth boundary", () => {
  it("login returns only user and sets HttpOnly cookie with backend TTL and legacy expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(
        envelope({ accessToken: credential, tokenType: "Bearer", expiresInSeconds: 1234 }),
      )
      .mockResolvedValueOnce(envelope(user));
    const response = await loginHandler(
      request("/api/auth/login", "POST", JSON.stringify({ username: "staff", password: "secret" })),
    );
    expect(await response.json()).toEqual(user);
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 1234,
    });
    expect(response.cookies.get(LEGACY_AUTH_COOKIE_NAME)?.maxAge).toBe(0);
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "http://backend.example.com/api/v1/identity/auth/login",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      username: "staff",
      password: "secret",
    });
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe(
      `Bearer ${credential}`,
    );
  });
  it("uses Secure cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock
      .mockResolvedValueOnce(
        envelope({ accessToken: credential, tokenType: "Bearer", expiresInSeconds: 28800 }),
      )
      .mockResolvedValueOnce(envelope(user));
    const response = await loginHandler(
      request("/api/auth/login", "POST", '{"username":"staff","password":"secret"}'),
    );
    expect(response.cookies.get(AUTH_COOKIE_NAME)?.secure).toBe(true);
  });
  it("failed /me does not create a session and revokes the newly issued backend session", async () => {
    fetchMock
      .mockResolvedValueOnce(
        envelope({ accessToken: credential, tokenType: "Bearer", expiresInSeconds: 28800 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockRejectedValueOnce(new Error("Unavailable"));
    const response = await loginHandler(
      request("/api/auth/login", "POST", '{"username":"staff","password":"secret"}'),
    );
    expect(response.status).toBe(401);
    expectExpired(response);
    expect(fetchMock.mock.calls[2][0].toString()).toContain("/identity/auth/logout");
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("Authorization")).toBe(
      `Bearer ${credential}`,
    );
    expect(JSON.stringify(await response.json())).not.toContain(credential);
  });
  it("session bootstrap forwards the cookie token server-side and strips extra backend fields", async () => {
    fetchMock.mockResolvedValue(envelope({ ...user, accessToken: credential }));
    const response = await meHandler(request("/api/auth/me"));
    expect(await response.json()).toEqual(user);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe(
      `Bearer ${credential}`,
    );
  });
  it("no cookie returns 401 without backend access", async () => {
    const response = await meHandler(request("/api/auth/me", "GET", undefined, { Cookie: "" }));
    expect(response.status).toBe(401);
    expectExpired(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("backend 401 clears session before the client can navigate back to login", async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 401 }));
    const response = await meHandler(request("/api/auth/me"));
    expect(response.status).toBe(401);
    expectExpired(response);
  });
  it.each([false, true])(
    "logout sends bearer before expiring cookie, even on failure=%s",
    async (fail) => {
      fetchMock.mockImplementation(async (_url, init) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${credential}`);
        expect(init?.body).toBeUndefined();
        if (fail) throw new Error("Unavailable");
        return new Response(null, { status: 204 });
      });
      const response = await logoutHandler(request("/api/auth/logout", "POST"));
      expect(response.status).toBe(204);
      expectExpired(response);
    },
  );
  it("sanitizes upstream exceptions and token-bearing profile strings", async () => {
    fetchMock.mockRejectedValue(new Error(credential));
    let response = await meHandler(request("/api/auth/me"));
    expect(JSON.stringify(await response.json())).not.toContain(credential);
    fetchMock.mockResolvedValue(envelope({ ...user, fullName: credential }));
    response = await meHandler(request("/api/auth/me"));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(credential);
  });
});

describe("constrained backend proxy", () => {
  it("injects cookie Bearer, ignores browser Authorization, and preserves query/status/JSON", async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [] }, { status: 201 }));
    const response = await backendProxyHandler(
      request("/api/backend/products?page=2&status=A&status=B", "GET", undefined, {
        Authorization: "browser-spoof",
        "X-Warehouse-Id": "warehouse",
      }),
      ["products"],
    );
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "http://backend.example.com/api/v1/products?page=2&status=A&status=B",
    );
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${credential}`);
    expect(new Headers(init?.headers).get("X-Warehouse-Id")).toBe("warehouse");
    expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ items: [] });
  });
  it.each([
    { paths: ["https:", "evil.example.com"] },
    { paths: ["..", "identity"] },
    { paths: ["%2e%2e"] },
    { paths: ["//evil.example.com"] },
    { paths: ["identity", "auth", "login"] },
  ])("rejects unsafe path $paths before fetching", async ({ paths }) => {
    const response = await backendProxyHandler(request("/api/backend/products"), paths);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("multipart bytes and content type survive forwarding, with no arbitrary header propagation", async () => {
    const contentType = "multipart/form-data; boundary=test";
    const body = "--test\r\nContent-Disposition: form-data; name=upload\r\n\r\nbytes\r\n--test--";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await backendProxyHandler(
      request("/api/backend/uploads", "POST", body, {
        "Content-Type": contentType,
        "X-Unsafe": "ignored",
      }),
      ["uploads"],
    );
    const init = fetchMock.mock.calls[0][1];
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(body);
    expect(new Headers(init?.headers).get("Content-Type")).toBe(contentType);
    expect(new Headers(init?.headers).has("X-Unsafe")).toBe(false);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
  it("preserves non-JSON error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response("Unavailable", { status: 503, headers: { "Content-Type": "text/plain" } }),
    );
    const response = await backendProxyHandler(request("/api/backend/products"), ["products"]);
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(await response.text()).toBe("Unavailable");
  });
  it.each(["Unauthorized", credential, '{"accessToken":"unexpected"}'])(
    "401 expires cookie, including unsafe upstream body",
    async (body) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 401 }));
      const response = await backendProxyHandler(request("/api/backend/products"), ["products"]);
      expect(response.status).toBe(401);
      expectExpired(response);
      expect(await response.text()).not.toContain(credential);
    },
  );
  it("blocks credential fields including escaped JSON keys, and backend Set-Cookie/Location", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"access\\u0054oken":"unexpected"}', {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "unsafe=1",
          Location: "https://evil.example.com",
        },
      }),
    );
    const response = await backendProxyHandler(request("/api/backend/products"), ["products"]);
    expect(response.status).toBe(502);
    expect(response.headers.has("Location")).toBe(false);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
});

describe("CSRF boundary", () => {
  it("canonical server origin supports reverse proxies and cannot be overridden by forwarded headers", () => {
    vi.stubEnv("APP_ORIGIN", origin);
    const internal = new NextRequest("http://internal:3000/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin, "X-Forwarded-Host": "evil.example.com" },
    });
    expect(isSameOrigin(internal)).toBe(true);
    internal.headers.set("Origin", "https://evil.example.com");
    expect(isSameOrigin(internal)).toBe(false);
  });
  it("invalid canonical origin fails closed", () => {
    vi.stubEnv("APP_ORIGIN", "https://backoffice.example.com/unexpected-path");
    expect(isSameOrigin(request("/api/auth/logout", "POST"))).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects explicit cross-origin %s",
    async (method) => {
      const response = await backendProxyHandler(
        request("/api/backend/products", method, undefined, { Origin: "https://evil.example.com" }),
        ["products"],
      );
      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("login and logout reject cross-origin or absent Origin", async () => {
    expect(
      (
        await loginHandler(
          request("/api/auth/login", "POST", "{}", { Origin: "https://evil.example.com" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await logoutHandler(request("/api/auth/logout", "POST", undefined, { Origin: "" }))).status,
    ).toBe(403);
  });
  it("same-origin unsafe request is accepted", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const response = await backendProxyHandler(request("/api/backend/products", "PATCH", "{}"), [
      "products",
    ]);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cross-site Fetch Metadata rejects even a matching Origin", async () => {
    const response = await backendProxyHandler(
      request("/api/backend/products", "POST", "{}", { "Sec-Fetch-Site": "cross-site" }),
      ["products"],
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
