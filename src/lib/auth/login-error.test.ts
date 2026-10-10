import { describe, expect, it } from "vitest";

import { LOGIN_ERROR_FALLBACK, LOGIN_ERROR_MESSAGES } from "@/constants/auth";

import { ApiError } from "@/lib/api/error";

import { loginErrorMessage } from "./login-error";

describe("loginErrorMessage", () => {
  it("maps by code, ignoring the transport message", () => {
    expect(loginErrorMessage(new ApiError(0, "NETWORK_ERROR", "anything"))).toBe(
      LOGIN_ERROR_MESSAGES.NETWORK_ERROR,
    );
    expect(loginErrorMessage(new ApiError(401, "UNAUTHORIZED", "ACCOUNT_NOT_ACTIVE"))).toBe(
      LOGIN_ERROR_MESSAGES.UNAUTHORIZED,
    );
  });
  it.each(["constructor", "toString", "__proto__", "HTTP_502", ""])(
    "unknown or prototype code %j falls back",
    (code) => {
      expect(loginErrorMessage(new ApiError(500, code, "server text"))).toBe(LOGIN_ERROR_FALLBACK);
    },
  );
  it("keeps local user-facing errors, falls back for anything else", () => {
    expect(loginErrorMessage(new Error("Không tìm thấy tài khoản demo."))).toBe(
      "Không tìm thấy tài khoản demo.",
    );
    expect(loginErrorMessage("boom")).toBe(LOGIN_ERROR_FALLBACK);
    expect(loginErrorMessage(new Error(""))).toBe(LOGIN_ERROR_FALLBACK);
  });
});
