// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, MOCK_LOGIN_PASSWORD } from "@/constants/auth";

import { getMockStaffUsers } from "@/lib/api/mock-adapter";

import { loginHandler, logoutHandler, meHandler } from "./handlers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ IS_MOCK: true }));

describe("mock BFF contract", () => {
  it("login/me return the selected safe user and logout revokes the server-only mock session", async () => {
    const staff = (await getMockStaffUsers()).find((candidate) => candidate.active);
    expect(staff).toBeDefined();
    if (!staff) throw new Error("No active mock staff");
    const origin = "http://localhost:3000";
    const response = await loginHandler(
      new NextRequest(`${origin}/api/auth/login`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: staff.email, password: MOCK_LOGIN_PASSWORD }),
      }),
    );
    expect(response.status).toBe(200);
    const user: unknown = await response.json();
    expect(user).toMatchObject({ userId: staff.userId, username: staff.email, roles: staff.roles });
    expect(user).not.toHaveProperty("accessToken");
    const cookie = response.cookies.get(AUTH_COOKIE_NAME);
    expect(cookie?.httpOnly).toBe(true);
    const headers = { Cookie: `${AUTH_COOKIE_NAME}=${cookie?.value}`, Origin: origin };
    expect(
      await (await meHandler(new NextRequest(`${origin}/api/auth/me`, { headers }))).json(),
    ).toEqual(user);
    expect(
      (
        await logoutHandler(
          new NextRequest(`${origin}/api/auth/logout`, { method: "POST", headers }),
        )
      ).status,
    ).toBe(204);
    expect((await meHandler(new NextRequest(`${origin}/api/auth/me`, { headers }))).status).toBe(
      401,
    );
  });
  it("wrong password yields the same UNAUTHORIZED code as Spring, with no session", async () => {
    const staff = (await getMockStaffUsers()).find((candidate) => candidate.active);
    if (!staff) throw new Error("No active mock staff");
    const origin = "http://localhost:3000";
    const response = await loginHandler(
      new NextRequest(`${origin}/api/auth/login`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: staff.email, password: "wrong-password" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(response.cookies.get(AUTH_COOKIE_NAME)?.value ?? "").toBe("");
  });
});
