// @vitest-environment node
import { AxiosError, AxiosHeaders } from "axios";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, MOCK_LOGIN_PASSWORD } from "@/constants/auth";
import { getMockStaffUsers } from "@/lib/api/mock-adapter";
import { backendProxyHandler, loginHandler } from "@/lib/auth/server/handlers";

import { getRolePermissionMatrix, listRoles, updateRolePermissions } from "./api";
import { api } from "@/lib/api/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: true }));

const originalAdapter = api.defaults.adapter;

beforeAll(async () => {
  const origin = "http://localhost:3000";
  const user = (await getMockStaffUsers()).find(
    (candidate) => candidate.userId === "USER-ADMIN-01",
  );
  if (!user) throw new Error("Missing existing demo admin");
  const response = await loginHandler(
    new NextRequest(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ username: user.email, password: MOCK_LOGIN_PASSWORD }),
    }),
  );
  const cookie = response.cookies.get(AUTH_COOKIE_NAME);
  if (!cookie) throw new Error("Missing mock server session");
  api.defaults.adapter = async (config) => {
    const method = (config.method ?? "GET").toUpperCase();
    const path = config.url ?? "";
    const result = await backendProxyHandler(
      new NextRequest(`${origin}/api/backend${path}`, {
        method,
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${cookie.value}`,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: method === "GET" ? undefined : config.data,
      }),
      path.slice(1).split("/"),
    );
    const data: unknown = await result.json();
    const upstream = {
      data,
      status: result.status,
      statusText: result.statusText,
      headers: new AxiosHeaders(),
      config,
    };
    if (result.status >= 400)
      throw new AxiosError("Mock BFF failure", "ERR_BAD_RESPONSE", config, undefined, upstream);
    return upstream;
  };
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

describe("permission management mock BFF routes", () => {
  it("returns role audit metadata from the role list route", async () => {
    const roles = await listRoles();

    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({
      code: "ECOMMERCE_ADMIN",
      createdAt: "2026-09-03T00:00:00Z",
    });
    expect(roles[1]?.description).toBeNull();
  });

  it("every listed mock role has a valid matrix", async () => {
    for (const role of await listRoles()) {
      expect((await getRolePermissionMatrix(role.code)).roleCode).toBe(role.code);
    }
  });
  it("returns a normal nested matrix and preserves sensitive actions", async () => {
    const matrix = await getRolePermissionMatrix("ECOMMERCE_ADMIN");

    expect(matrix.groups[0]?.resources[0]?.actions).toEqual([
      { action: "VIEW_PAGE", label: "Open page", granted: true, sensitive: false },
      { action: "READ", label: "Read data", granted: true, sensitive: false },
      { action: "APPROVE", label: "Approve", granted: false, sensitive: true },
    ]);
  });

  it.each([
    ["EMPTY_GROUPS", 0, 0, 0],
    ["EMPTY_RESOURCES", 1, 0, 0],
    ["EMPTY_ACTIONS", 1, 1, 0],
  ] as const)(
    "supports empty matrix shape %s",
    async (roleCode, groupCount, resourceCount, actionCount) => {
      const matrix = await getRolePermissionMatrix(roleCode);

      expect(matrix.groups).toHaveLength(groupCount);
      expect(matrix.groups.flatMap((group) => group.resources)).toHaveLength(resourceCount);
      expect(
        matrix.groups.flatMap((group) => group.resources.flatMap((resource) => resource.actions)),
      ).toHaveLength(actionCount);
    },
  );

  it("propagates unknown role as ApiError 404", async () => {
    await expect(getRolePermissionMatrix("UNKNOWN_ROLE")).rejects.toMatchObject({
      status: 404,
      code: "ROLE_NOT_FOUND",
    });
  });

  it("propagates forbidden matrix access as ApiError 403", async () => {
    await expect(getRolePermissionMatrix("FORBIDDEN")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });
  it("PUT replaces complete grants, increments version, and rejects stale version", async () => {
    const base = await getRolePermissionMatrix("ECOMMERCE_ADMIN");
    const saved = await updateRolePermissions(base.roleCode, {
      version: base.version,
      permissions: ["identity-rbac:READ", "identity-rbac:APPROVE"],
    });
    expect(saved.version).toBe(base.version + 1);
    expect(saved.grantedCount).toBe(2);
    expect(saved.groups[0]?.resources[0]?.actions[2]?.granted).toBe(true);
    expect((await getRolePermissionMatrix(base.roleCode)).version).toBe(saved.version);
    await expect(
      updateRolePermissions(base.roleCode, { version: base.version, permissions: [] }),
    ).rejects.toMatchObject({ status: 409, code: "ROLE_PERMISSIONS_CHANGED" });
  });
  it("non-editable matrix rejects PUT even with explicit APPROVE", async () => {
    const base = await getRolePermissionMatrix("EMPTY_GROUPS");
    expect(base.editable).toBe(false);
    await expect(
      updateRolePermissions(base.roleCode, { version: base.version, permissions: [] }),
    ).rejects.toMatchObject({ status: 409, code: "ROLE_NOT_EDITABLE" });
  });
  it("rejects permissions outside the matrix catalog", async () => {
    const base = await getRolePermissionMatrix("ECOMMERCE_ADMIN");
    await expect(
      updateRolePermissions(base.roleCode, {
        version: base.version,
        permissions: ["identity-roles:READ"],
      }),
    ).rejects.toMatchObject({ status: 400, code: "UNKNOWN_PERMISSION" });
  });
});
