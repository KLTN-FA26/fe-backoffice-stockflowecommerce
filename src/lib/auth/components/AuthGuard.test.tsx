import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_EVENT_STORAGE_KEY, AUTH_STORAGE_KEY } from "@/constants/auth";

import { ApiError } from "@/lib/api/error";

import { getCurrentUserApi } from "../auth-api";
import { publishAuthEvent } from "../auth-events";
import { bootstrapSession } from "../auth-session";
import { useAuthStore } from "../auth-store";
import { AuthGuard } from "./AuthGuard";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../auth-api", () => ({ getCurrentUserApi: vi.fn() }));
const user = {
  userId: "staff",
  username: "staff",
  email: "staff@example.com",
  fullName: null,
  status: "ACTIVE",
  roles: [],
  lastLoginAt: null,
};
const rejected = () => Promise.reject(new ApiError(401, "UNAUTHENTICATED", "Signed out"));
const mount = () =>
  render(
    <AuthGuard>
      <div>Protected admin</div>
    </AuthGuard>,
  );

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined);
  useAuthStore.getState().beginBootstrap();
  localStorage.clear();
  vi.mocked(getCurrentUserApi).mockReset();
  replace.mockReset();
});
afterEach(async () => {
  cleanup();
  await bootstrapSession();
  useAuthStore.getState().logout(false);
  vi.unstubAllGlobals();
});

describe("server session AuthGuard", () => {
  it("does not render or redirect until /auth/me finishes, then renders a verified user", async () => {
    let finish: ((value: typeof user) => void) | undefined;
    vi.mocked(getCurrentUserApi).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    expect(screen.queryByText("Protected admin")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      finish?.(user);
    });
    expect(screen.getByText("Protected admin")).toBeInTheDocument();
    expect(getCurrentUserApi).toHaveBeenCalledTimes(1);
    vi.mocked(getCurrentUserApi).mockResolvedValue(user);
  });
  it("failed session bootstrap redirects without protected content", async () => {
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
    mount();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Protected admin")).not.toBeInTheDocument();
  });
  it("network/server failure stays unknown and offers retry, avoiding a cookie redirect loop", async () => {
    vi.mocked(getCurrentUserApi).mockRejectedValue(new ApiError(502, "UPSTREAM", "Unavailable"));
    mount();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Protected admin")).not.toBeInTheDocument();
  });
  it.each([
    JSON.stringify({
      state: {
        user,
        tokens: { accessToken: "legacy", refreshToken: "obsolete" },
        isAuthenticated: true,
      },
    }),
    "{broken",
  ])("discards legacy persistence without restoring identity: %s", async (persisted) => {
    localStorage.setItem(AUTH_STORAGE_KEY, persisted);
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
    mount();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState()).not.toHaveProperty("tokens");
  });
  it("cross-tab fallback events revalidate stale in-memory auth against the BFF", async () => {
    useAuthStore.getState().login(user, false);
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
    mount();
    expect(screen.getByText("Protected admin")).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUTH_EVENT_STORAGE_KEY,
          newValue: JSON.stringify({ event: "logout", nonce: "event" }),
        }),
      ),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getCurrentUserApi).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
  });
  it("unrelated storage events do not affect the session", () => {
    useAuthStore.getState().login(user, false);
    vi.mocked(getCurrentUserApi).mockResolvedValue(user);
    mount();
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "changed" })),
    );
    expect(getCurrentUserApi).not.toHaveBeenCalled();
    expect(screen.getByText("Protected admin")).toBeInTheDocument();
  });
  it("focus revalidates a session changed while the tab was inactive", async () => {
    useAuthStore.getState().login(user, false);
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
    mount();
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
  it("a pending bootstrap cannot resurrect a newer local logout", async () => {
    let finish: ((value: typeof user) => void) | undefined;
    vi.mocked(getCurrentUserApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    act(() => useAuthStore.getState().logout(false));
    await act(async () => {
      finish?.(user);
    });
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
  });
  it("session-change notification supersedes an older bootstrap response", async () => {
    let finish: ((value: typeof user) => void) | undefined;
    vi.mocked(getCurrentUserApi)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(rejected);
    mount();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUTH_EVENT_STORAGE_KEY,
          newValue: JSON.stringify({ event: "session-changed" }),
        }),
      ),
    );
    await act(async () => {
      finish?.(user);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getCurrentUserApi).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Protected admin")).not.toBeInTheDocument();
  });
  it("BroadcastChannel sends only an event and receiving tabs revalidate", async () => {
    const channels: {
      onmessage: ((message: MessageEvent<unknown>) => void) | null;
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }[] = [];
    class Channel {
      onmessage: ((message: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", Channel);
    useAuthStore.getState().login(user, false);
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
    mount();
    publishAuthEvent("logout");
    expect(channels[1].postMessage).toHaveBeenCalledExactlyOnceWith("logout");
    act(() => channels[0].onmessage?.(new MessageEvent("message", { data: "session-changed" })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(localStorage.getItem(AUTH_EVENT_STORAGE_KEY)).toBeNull();
  });
  it("storage fallback notification contains only event and nonce", () => {
    publishAuthEvent("session-changed");
    expect(Object.keys(JSON.parse(localStorage.getItem(AUTH_EVENT_STORAGE_KEY) ?? "{}"))).toEqual([
      "event",
      "nonce",
    ]);
    vi.mocked(getCurrentUserApi).mockImplementation(rejected);
  });
});
