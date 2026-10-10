// @vitest-environment node
import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/constants/auth";

import { proxy } from "@/proxy";

vi.mock("server-only", () => ({}));

describe("credential ownership regression", () => {
  it("browser auth modules expose no tokens, persist middleware, cookie access or refresh behavior", () => {
    for (const path of [
      "auth-api.ts",
      "auth-store.ts",
      "auth-schemas.ts",
      "auth-session.ts",
      "auth-events.ts",
      "use-auth-lifecycle.ts",
      "components/AuthGuard.tsx",
      "index.ts",
    ]) {
      const source = readFileSync(`src/lib/auth/${path}`, "utf8");
      expect(source, path).not.toMatch(
        /accessToken|AuthTokens|Bearer|document\.cookie|refreshToken|refresh_token|\/auth\/refresh|zustand\/middleware/,
      );
    }
    const client = readFileSync("src/lib/api/client.ts", "utf8");
    expect(client).not.toMatch(/accessToken|Bearer|refreshToken|\/auth\/refresh/);
    expect(client).toContain('cfg.headers.delete("Authorization")');
  });
  it("server credential modules enforce the server-only boundary", () => {
    for (const path of ["backend.ts", "cookie.ts", "handlers.ts", "mock.ts"]) {
      expect(readFileSync(`src/lib/auth/server/${path}`, "utf8")).toContain('import "server-only"');
    }
  });
  it("public page entry expires the old readable cookie before browser JavaScript runs", () => {
    const response = proxy(
      new NextRequest("https://backoffice.example.com/", {
        headers: { Cookie: `${LEGACY_AUTH_COOKIE_NAME}=legacy` },
      }),
    );
    expect(response.cookies.get(LEGACY_AUTH_COOKIE_NAME)).toMatchObject({
      value: "",
      maxAge: 0,
      httpOnly: true,
    });
    expect(response.headers.get("Location")).toBeNull();
  });
  it("proxy checks the new server cookie as a routing hint; legacy cookie cannot establish auth", () => {
    const legacy = proxy(
      new NextRequest("https://backoffice.example.com/admin", {
        headers: { Cookie: "stockflow-auth-token=legacy" },
      }),
    );
    expect(legacy.headers.get("Location")).toContain("/login");
    expect(legacy.cookies.get(LEGACY_AUTH_COOKIE_NAME)).toMatchObject({
      value: "",
      maxAge: 0,
      httpOnly: true,
    });
    const current = proxy(
      new NextRequest("https://backoffice.example.com/admin", {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=present` },
      }),
    );
    expect(current.headers.get("Location")).toBeNull();
    const expired = proxy(
      new NextRequest("https://backoffice.example.com/login", {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=` },
      }),
    );
    expect(expired.headers.get("Location")).toBeNull();
  });
});
