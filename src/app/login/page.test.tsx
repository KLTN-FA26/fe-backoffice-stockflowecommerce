import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOGIN_ERROR_FALLBACK, LOGIN_ERROR_MESSAGES } from "@/constants/auth";

import { ApiError } from "@/lib/api/error";
import { loginApi } from "@/lib/auth/auth-api";
import { useAuthStore } from "@/lib/auth/auth-store";

import LoginPage from "./page";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams("callbackUrl=/admin/products"),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => false }));
vi.mock("@/components/shared/Logo", () => ({ Logo: () => <span>Logo</span> }));
vi.mock("@/lib/auth/auth-api", () => ({
  loginApi: vi.fn(),
  mockLoginApi: vi.fn(),
  getMockLoginUsersApi: vi.fn(),
  getCurrentUserApi: vi.fn(),
}));
const user = {
  userId: "staff",
  username: "staff",
  email: "staff@example.com",
  fullName: null,
  status: "ACTIVE",
  roles: [],
  lastLoginAt: null,
};
beforeEach(() => {
  useAuthStore.getState().logout(false);
});
afterEach(() => {
  useAuthStore.getState().logout(false);
  vi.clearAllMocks();
});
async function submit() {
  const actor = userEvent.setup();
  render(<LoginPage />);
  await actor.type(screen.getByLabelText("Tên đăng nhập"), "staff.username");
  await actor.type(screen.getByLabelText("Mật khẩu", { exact: true }), "secret");
  await actor.click(screen.getByRole("button", { name: "Đăng nhập vào hệ thống" }));
}
describe("BFF login form", () => {
  it("sends username and waits for safe server login before navigation", async () => {
    let finish: ((value: typeof user) => void) | undefined;
    vi.mocked(loginApi).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await submit();
    expect(loginApi).toHaveBeenCalledWith({ username: "staff.username", password: "secret" });
    expect(replace).not.toHaveBeenCalled();
    finish?.(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/products"));
  });
  it("shows failed server bootstrap without navigating", async () => {
    vi.mocked(loginApi).mockRejectedValue(new Error("Không thể tải tài khoản"));
    await submit();
    expect(await screen.findByText("Không thể tải tài khoản")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it.each([
    [401, "UNAUTHORIZED", LOGIN_ERROR_MESSAGES.UNAUTHORIZED],
    [403, "ACCOUNT_NOT_ACTIVE", LOGIN_ERROR_MESSAGES.ACCOUNT_NOT_ACTIVE],
    [403, "ACCOUNT_TEMPORARILY_LOCKED", LOGIN_ERROR_MESSAGES.ACCOUNT_TEMPORARILY_LOCKED],
    [429, "RATE_LIMITED", LOGIN_ERROR_MESSAGES.RATE_LIMITED],
    [403, "SOME_FUTURE_CODE", LOGIN_ERROR_FALLBACK],
    [500, "LOGIN_FAILED", LOGIN_ERROR_FALLBACK],
  ])(
    "%i %s shows its own copy, keeps the form and does not navigate",
    async (status, code, text) => {
      // The transport message is identical for every code: the copy must come from the code alone.
      vi.mocked(loginApi).mockRejectedValue(
        new ApiError(status, code, "Không thể hoàn tất yêu cầu."),
      );
      await submit();
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.queryByText("Không thể hoàn tất yêu cầu.")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Tên đăng nhập")).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it("routes an already server-verified identity to the callback", async () => {
    useAuthStore.getState().login(user, false);
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/products"));
    expect(screen.queryByLabelText("Tên đăng nhập")).not.toBeInTheDocument();
  });
});
