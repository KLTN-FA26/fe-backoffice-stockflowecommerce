import "server-only";

import { MOCK_AUTH_EXPIRES_SECONDS, MOCK_LOGIN_PASSWORD } from "@/constants/auth";
import { PERMISSION_QUERY } from "@/constants/permissions";

import { getMockStaffUsers } from "@/lib/api/mock-adapter";
import { loginRequestSchema } from "@/lib/auth/auth-schemas";

import { BACKEND_AUTH_PATHS } from "./backend";
import { mockRbacBackend } from "./mock-rbac";
import { mockSessionPermissions } from "./mock-permissions";

type MockSession = { userId: string; expiresAt: number };
// Route bundles share demo sessions within the same server process; never browser state.
const mockRuntime = globalThis as typeof globalThis & {
  stockflowMockSessions?: Map<string, MockSession>;
};
const sessions = (mockRuntime.stockflowMockSessions ??= new Map<string, MockSession>());
export async function mockAuthBackend(path: string, init: RequestInit): Promise<Response> {
  if (path === BACKEND_AUTH_PATHS.login && init.method === "POST") {
    const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : "null");
    const parsed = loginRequestSchema.safeParse(body);
    const users = await getMockStaffUsers();
    const user =
      parsed.success && parsed.data.password === MOCK_LOGIN_PASSWORD
        ? users.find((candidate) => candidate.active && candidate.email === parsed.data.username)
        : undefined;
    // Same envelope as Spring (ApiResponse): the BFF reads errorCode, never the message.
    if (!user)
      return Response.json(
        { success: false, errorCode: "UNAUTHORIZED", message: "Đăng nhập thất bại." },
        { status: 401 },
      );
    const accessToken = crypto.randomUUID();
    sessions.set(accessToken, {
      userId: user.userId,
      expiresAt: Date.now() + MOCK_AUTH_EXPIRES_SECONDS * 1000,
    });
    return Response.json({
      accessToken,
      tokenType: "Bearer",
      expiresInSeconds: MOCK_AUTH_EXPIRES_SECONDS,
    });
  }
  const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now())
    return Response.json({ message: "Phiên đăng nhập đã kết thúc." }, { status: 401 });
  if (path === BACKEND_AUTH_PATHS.logout && init.method === "POST") {
    sessions.delete(token);
    return new Response(null, { status: 204 });
  }
  if (path === "identity/roles" || path.startsWith("identity/roles/")) {
    const user = (await getMockStaffUsers()).find(
      (candidate) => candidate.userId === session.userId,
    );
    if (!user) return Response.json({}, { status: 401 });
    const response = await mockRbacBackend(
      path,
      init,
      mockSessionPermissions(user.userId, user.roles).permissions,
    );
    if (response) return response;
  }
  if (path === PERMISSION_QUERY.path.slice(1) && init.method === "GET") {
    const user = (await getMockStaffUsers()).find(
      (candidate) => candidate.userId === session.userId,
    );
    if (!user) return Response.json({}, { status: 401 });
    return Response.json(mockSessionPermissions(user.userId, user.roles));
  }
  if (path === BACKEND_AUTH_PATHS.me && init.method === "GET") {
    const users = await getMockStaffUsers();
    const user = users.find((candidate) => candidate.userId === session.userId);
    if (!user) return Response.json({}, { status: 401 });
    return Response.json({
      userId: user.userId,
      username: user.email,
      fullName: user.fullName,
      email: user.email,
      status: user.active ? "ACTIVE" : "INACTIVE",
      roles: user.roles,
      lastLoginAt: null,
    });
  }
  return Response.json({ message: "Not found" }, { status: 404 });
}
