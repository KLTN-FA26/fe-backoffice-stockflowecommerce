import "server-only";

import { z } from "zod";

import { IS_MOCK } from "@/lib/config";

export const BACKEND_AUTH_PATHS = {
  login: "identity/auth/login",
  me: "identity/me",
  logout: "identity/auth/logout",
} as const;
// BE develop identity/internal/controller/dto/AuthTokenResponse.java. Server only.
export const backendTokensSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresInSeconds: z.number().int().positive(),
});

export function backendUrl(path: string, query = ""): URL {
  const base = new URL(
    (process.env.API_URL ?? "http://localhost:8080/api/v1").replace(/\/+$/, "") + "/",
  );
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Invalid backend configuration");
  const target = new URL(base.href + path);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname))
    throw new Error("Invalid backend path");
  target.search = query;
  return target;
}
export async function backendFetch(path: string, init: RequestInit, query = ""): Promise<Response> {
  if (IS_MOCK) {
    const { mockAuthBackend } = await import("./mock");
    return mockAuthBackend(path, init);
  }
  return fetch(backendUrl(path, query), {
    ...init,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
}
export async function unwrapBackend(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    data.success === true &&
    "data" in data
  )
    return data.data;
  return data;
}
