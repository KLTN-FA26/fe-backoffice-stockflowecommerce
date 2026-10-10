import { AUTH_API_BASE, AUTH_PATHS, MOCK_LOGIN_PASSWORD } from "@/constants/auth";

import { api } from "@/lib/api/client";

import { authUserSchema, loginRequestSchema } from "./auth-schemas";
import { useAuthStore } from "./auth-store";

import type { AuthUser, LoginRequest, LoginResponse } from "./auth-schemas";

export type { LoginRequest, LoginResponse } from "./auth-schemas";

export interface MockLoginUser {
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
}

export async function loginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<unknown>(
    AUTH_PATHS.login,
    loginRequestSchema.parse(credentials),
    { baseURL: AUTH_API_BASE },
  );
  const user = authUserSchema.parse(data);
  useAuthStore.getState().login(user);
  return user;
}

export async function getCurrentUserApi(): Promise<AuthUser> {
  const { data } = await api.get<unknown>(AUTH_PATHS.me, { baseURL: AUTH_API_BASE });
  return authUserSchema.parse(data);
}

/** User-triggered logout: ask the server to revoke first, always clear local state afterwards. */
export async function logoutApi(): Promise<void> {
  try {
    await api.post(AUTH_PATHS.logout, undefined, { baseURL: AUTH_API_BASE });
  } catch {
    // Logout deliberately tolerates a revoked session or unavailable server.
  } finally {
    useAuthStore.getState().logout();
  }
}

/** Demo selection resolves to a username without changing the production DTO. */
export async function mockLoginApi(userId: string): Promise<LoginResponse> {
  const users = await getMockLoginUsersApi();
  const user = users.find((candidate) => candidate.userId === userId);
  if (!user) throw new Error("Không tìm thấy tài khoản demo.");
  return loginApi({ username: user.email, password: MOCK_LOGIN_PASSWORD });
}

export async function getMockLoginUsersApi(): Promise<MockLoginUser[]> {
  const { data } = await api.get<{ items: MockLoginUser[] }>("/staff-users");
  return Array.isArray(data?.items) ? data.items : [];
}
