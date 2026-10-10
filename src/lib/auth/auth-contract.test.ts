import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_API_BASE, AUTH_PATHS, AUTH_STORAGE_KEY, BROWSER_API_BASE } from "@/constants/auth";

import { api } from "@/lib/api/client";

import { getCurrentUserApi, loginApi, logoutApi } from "./auth-api";
import { useAuthStore } from "./auth-store";

import type { InternalAxiosRequestConfig } from "axios";

const user = {
  userId: "staff",
  username: "staff",
  email: "staff@example.com",
  fullName: null,
  status: "ACTIVE",
  roles: [],
  lastLoginAt: null,
};
const originalAdapter = api.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let status: number;
let data: unknown;
const redirect = vi.fn();
beforeEach(() => {
  requests = [];
  status = 200;
  data = user;
  useAuthStore.getState().logout(false);
  localStorage.clear();
  api.defaults.adapter = async (config) => {
    requests.push(config);
    const response = { config, status, statusText: "", headers: {}, data: { success: true, data } };
    if (status >= 400) throw new AxiosError("Rejected", undefined, config, undefined, response);
    return response;
  };
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("safe browser auth contract", () => {
  it("posts username to the BFF and receives only validated user data", async () => {
    expect(await loginApi({ username: "staff", password: "secret" })).toEqual(user);
    expect(requests[0]).toMatchObject({ baseURL: AUTH_API_BASE, url: AUTH_PATHS.login });
    expect(JSON.parse(requests[0].data)).toEqual({ username: "staff", password: "secret" });
    expect(useAuthStore.getState()).toMatchObject({ user, status: "authenticated" });
    expect(useAuthStore.getState()).not.toHaveProperty("tokens");
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
  it("loads a safe identity from BFF session bootstrap", async () => {
    expect(await getCurrentUserApi()).toEqual(user);
    expect(requests[0]).toMatchObject({ baseURL: AUTH_API_BASE, url: AUTH_PATHS.me });
  });
  it("rejects an obsolete token DTO as a browser login response", async () => {
    data = { accessToken: "legacy", tokenType: "Bearer", expiresInSeconds: 28800 };
    await expect(loginApi({ username: "staff", password: "secret" })).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
  it("never attaches Authorization, including caller-supplied credentials", async () => {
    useAuthStore.getState().login(user, false);
    await api.get("/products", { headers: { Authorization: "untrusted" } });
    expect(requests[0].baseURL).toBe(BROWSER_API_BASE);
    expect(requests[0].headers.has("Authorization")).toBe(false);
  });
  it("401 clears UI auth and redirects without retry or refresh", async () => {
    useAuthStore.getState().login(user, false);
    vi.stubGlobal("window", { location: { pathname: "/admin/products", replace: redirect } });
    status = 401;
    await expect(api.get("/products")).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(requests.map((request) => request.url)).toEqual(["/products"]);
  });
  it("failed login 401 keeps the BFF code and never triggers the expired-session redirect", async () => {
    // Pathname outside /login proves the exemption is the login URL itself.
    vi.stubGlobal("window", { location: { pathname: "/admin/products", replace: redirect } });
    api.defaults.adapter = async (config) => {
      requests.push(config);
      const response = {
        config,
        status: 401,
        statusText: "",
        headers: {},
        data: { code: "UNAUTHORIZED", message: "Không thể hoàn tất yêu cầu." },
      };
      throw new AxiosError("Rejected", undefined, config, undefined, response);
    };
    await expect(loginApi({ username: "staff", password: "wrong" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });
  it.each([200, 500])("logout clears UI even when server status is %s", async (responseStatus) => {
    useAuthStore.getState().login(user, false);
    status = responseStatus;
    await logoutApi();
    expect(requests[0]).toMatchObject({
      baseURL: AUTH_API_BASE,
      url: AUTH_PATHS.logout,
      data: undefined,
    });
    expect(requests[0].headers.has("Authorization")).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ user: null, status: "unauthenticated" });
  });
  it("logout also clears UI on network failure", async () => {
    useAuthStore.getState().login(user, false);
    api.defaults.adapter = async (config) => {
      throw new AxiosError("Offline", undefined, config);
    };
    await logoutApi();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it("other errors do not clear the session", async () => {
    useAuthStore.getState().login(user, false);
    status = 403;
    await expect(api.get("/products")).rejects.toMatchObject({ status: 403 });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
