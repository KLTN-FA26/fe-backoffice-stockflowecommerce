/** Same-origin BFF client: credentials are transported exclusively by Next.js. */

import axios from "axios";

import { APP_ROUTES } from "@/constants";
import { AUTH_PATHS, BROWSER_API_BASE } from "@/constants/auth";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useAppStore } from "@/lib/store/use-app-store";

import { ApiError } from "./error";

import type { AxiosError } from "axios";
import type { ApiErrorBody } from "./error";

export const api = axios.create({
  baseURL: BROWSER_API_BASE,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

/* ── Request interceptor ─────────────────────────────────────────────── */

api.interceptors.request.use((cfg) => {
  cfg.headers.delete("Authorization");
  const wh = useAppStore.getState().warehouseId;
  if (wh) cfg.headers.set("X-Warehouse-Id", wh);
  return cfg;
});

/* ── Response interceptor ────────────────────────────────────────────── */

api.interceptors.response.use(
  (res) => {
    const body: unknown = res.data;
    if (
      typeof body === "object" &&
      body !== null &&
      "success" in body &&
      body.success === true &&
      "data" in body
    ) {
      return { ...res, data: body.data };
    }
    return res;
  },
  (err: AxiosError<ApiErrorBody>) => {
    if (err.response?.status === 401 && err.config?.url !== AUTH_PATHS.me) {
      useAuthStore.getState().logout();
      // Failed login stays on the form so it can display the normalized error.
      if (
        err.config?.url !== AUTH_PATHS.login &&
        typeof window !== "undefined" &&
        window.location.pathname !== APP_ROUTES.login
      ) {
        window.location.replace(APP_ROUTES.login);
      }
    }
    return Promise.reject(ApiError.from(err));
  },
);
