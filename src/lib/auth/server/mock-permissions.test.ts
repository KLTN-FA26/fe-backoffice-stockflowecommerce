// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, MOCK_LOGIN_PASSWORD } from "@/constants/auth";
import { PERMISSION_QUERY, SUPPLIER_PERMISSIONS } from "@/constants/permissions";

import { getMockStaffUsers } from "@/lib/api/mock-adapter";
import { useAuthStore } from "@/lib/auth/auth-store";
import { myPermissionsSchema } from "@/lib/auth/me-permissions";

import { backendProxyHandler, loginHandler } from "./handlers";
import { mockSessionPermissions } from "./mock-permissions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: true }));

describe("explicit mock permission responses", () => {
  it("grants depend only on explicit session fixture, never supplied or impersonated roles", () => {
    expect(mockSessionPermissions("USER-PLAN-01", ["System Admin"]).permissions).toEqual([]);
    expect(mockSessionPermissions("unknown", ["System Admin"]).permissions).toEqual([]);
    expect(mockSessionPermissions("USER-PROC-01", []).permissions).toContain(
      SUPPLIER_PERMISSIONS.create,
    );
  });
  it("BFF permissions return the cookie-selected user's validated list despite frontend impersonation", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    const staff = (await getMockStaffUsers()).find(
      (candidate) => candidate.userId === "USER-PLAN-01",
    );
    if (!staff) throw new Error("Missing existing demo staff");
    const origin = "http://localhost:3000";
    const response = await loginHandler(
      new NextRequest(`${origin}/api/auth/login`, {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ username: staff.email, password: MOCK_LOGIN_PASSWORD }),
      }),
    );
    const cookie = response.cookies.get(AUTH_COOKIE_NAME);
    useAuthStore.getState().setImpersonatedRole("System Admin");
    const permissions = await backendProxyHandler(
      new NextRequest(`${origin}/api/backend${PERMISSION_QUERY.path}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${cookie?.value}` },
      }),
      ["identity", "me", "permissions"],
    );
    expect(permissions.status).toBe(200);
    expect(myPermissionsSchema.parse(await permissions.json())).toEqual({
      roles: staff.roles,
      permissions: [],
      dataScope: "ALL",
    });
    useAuthStore.getState().setImpersonatedRole(null);
    vi.unstubAllEnvs();
  });
  it("production authorization contains no legacy role policy or browser credential regression", () => {
    expect(existsSync("src/lib/auth/permissions.ts")).toBe(false);
    expect(existsSync("src/lib/api/mock-routes-me.ts")).toBe(false);
    for (const path of [
      "src/lib/auth/components/Can.tsx",
      "src/lib/auth/me-permissions.ts",
      "src/features/product/lifecycle.ts",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /effectiveRoles|impersonatedRole|RoleName|ROLE_PERMISSIONS|permissionsFor|accessToken|refreshToken|Authorization.*Bearer/,
      );
    }
  });
});
