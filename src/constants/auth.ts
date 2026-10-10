export const AUTH_PATHS = { login: "/auth/login", me: "/auth/me", logout: "/auth/logout" } as const;
export const BROWSER_API_BASE = "/api/backend";
export const AUTH_API_BASE = "/api";
export const AUTH_COOKIE_NAME = "stockflow-session";
export const LEGACY_AUTH_COOKIE_NAME = "stockflow-auth-token";
export const AUTH_STORAGE_KEY = "stockflow-auth";
export const AUTH_EVENT_CHANNEL = "stockflow-session-events";
export const AUTH_EVENT_STORAGE_KEY = "stockflow:auth:event";
export const AUTH_UI = {
  bootstrapError: "Không thể xác minh phiên đăng nhập.",
  retry: "Thử lại",
} as const;
/**
 * BE `ErrorCode` names (ApiResponse.errorCode) a failed login may keep through the BFF. Explicit
 * allow-list: any other upstream code becomes LOGIN_FAILED, so new BE codes are never exposed by
 * accident. UNAUTHORIZED 401 (unknown user OR wrong password - never distinguished),
 * ACCOUNT_NOT_ACTIVE 403, ACCOUNT_TEMPORARILY_LOCKED 403 (BE #72), RATE_LIMITED 429.
 */
export const LOGIN_ERROR_CODES = [
  "UNAUTHORIZED",
  "ACCOUNT_NOT_ACTIVE",
  "ACCOUNT_TEMPORARILY_LOCKED",
  "RATE_LIMITED",
] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];
export const LOGIN_FAILED_CODE = "LOGIN_FAILED";
/** Login-page copy keyed by ApiError.code; the UI owns the wording, never the BE message. */
export const LOGIN_ERROR_MESSAGES: Readonly<Record<LoginErrorCode | "NETWORK_ERROR", string>> = {
  UNAUTHORIZED: "Tên đăng nhập hoặc mật khẩu không đúng.",
  ACCOUNT_NOT_ACTIVE: "Tài khoản hiện không thể đăng nhập. Vui lòng liên hệ quản trị viên.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.",
  RATE_LIMITED: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
  NETWORK_ERROR: "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.",
};
export const LOGIN_ERROR_FALLBACK = "Đăng nhập thất bại. Vui lòng thử lại.";
export const MOCK_AUTH_EXPIRES_SECONDS = 28800;
export const MOCK_LOGIN_PASSWORD = "mock-only";
