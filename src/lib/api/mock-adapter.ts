/**
 * Mock adapter for axios.
 *
 * When `USE_MOCK=true` (server-only flag, see `src/lib/config.ts`) this
 * adapter intercepts every request and resolves it against `mock-data.ts` —
 * simulating server-side pagination, filtering, sorting, latency, and
 * occasional errors.
 *
 * `activateMockAdapter()` is only called (from `AppProviders`) when the
 * server-derived `isMock` flag is true — no env var is read here.
 *
 * **Only this file may import mock-data.ts** — enforced by CI grep.
 */

import axios, { AxiosError } from "axios";

import { AUTH_API_BASE, AUTH_PATHS } from "@/constants/auth";
import { PERMISSION_QUERY } from "@/constants/permissions";

import { api } from "./client";

import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { LegacyPaginatedResponse, PaginatedResponse } from "./query-factory";

/* ── Types ───────────────────────────────────────────────────────────── */

interface MockResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  statusText?: string;
}

type RouteHandler = (config: AxiosRequestConfig) => Promise<MockResponse> | MockResponse;

/* ── Route registry ──────────────────────────────────────────────────── */

const routes = new Map<string, Map<string, RouteHandler>>();

export function registerMockRoute(method: string, pattern: string, handler: RouteHandler): void {
  const methodUpper = method.toUpperCase();
  if (!routes.has(methodUpper)) routes.set(methodUpper, new Map());
  routes.get(methodUpper)!.set(pattern, handler);
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Random delay between 200–500ms to simulate network latency. */
const delay = (ms?: number) =>
  new Promise<void>((r) => setTimeout(r, ms ?? 200 + Math.random() * 300));

/**
 * Paginate an array server-style — LEGACY 1-based (`page`, `pageSize`).
 * Các màn mock-only cũ (receipt, invoice…) vẫn gửi `page=1&pageSize=`; đổi chữ ký
 * hàm này sẽ làm rỗng các list đó. Route đã khớp BE PageResponse dùng `paginatePage`.
 */
export function paginate<T>(items: T[], page = 1, pageSize = 15): LegacyPaginatedResponse<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

/** Paginate theo BE PageResponse — `page` đánh số từ 0, `size`. */
export function paginatePage<T>(items: T[], page = 0, size = 15): PaginatedResponse<T> {
  const start = page * size;
  const totalElements = items.length;
  const totalPages = size <= 0 ? 0 : Math.ceil(totalElements / size);
  return {
    items: items.slice(start, start + size),
    totalElements,
    page,
    size,
    totalPages,
    hasNext: page + 1 < totalPages,
    hasPrevious: page > 0,
  };
}

/* ── Query params ────────────────────────────────────────────────────── */

/**
 * Axios chỉ gộp `config.params` vào `config.url` **bên trong adapter dựng sẵn**
 * (`helpers/resolveConfig.ts` cho xhr/fetch, `adapters/http.js` cho node).
 * `dispatchRequest` gọi custom adapter với `config` thô → `config.url` không có
 * query string, mọi route mock đọc `config.url?.split("?")[1]` sẽ thấy rỗng.
 *
 * Hàm này tự serialize để handler thấy đúng param. Mảng phát ra **key lặp lại**
 * (`status=A&status=B`) chứ không phải `status[]=` — khớp `params.getAll(key)`.
 */
export function serializeMockParams(params: unknown): string {
  if (!params) return "";
  if (params instanceof URLSearchParams) return params.toString();
  if (typeof params !== "object") return "";

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      if (item === undefined || item === null || item === "") continue;
      search.append(key, String(item));
    }
  }
  return search.toString();
}

/** Gắn query string đã serialize vào `config.url` để handler đọc được. */
function withQueryString<T extends AxiosRequestConfig>(config: T): T {
  const query = serializeMockParams(config.params);
  if (!query) return config;
  const base = config.url ?? "/";
  const separator = base.includes("?") ? "&" : "?";
  return { ...config, url: `${base}${separator}${query}` };
}

/* ── Match URL to registered pattern ─────────────────────────────────── */

function matchRoute(
  method: string,
  url: string,
): { handler: RouteHandler; params: Record<string, string> } | null {
  const methodRoutes = routes.get(method.toUpperCase());
  if (!methodRoutes) return null;

  for (const [pattern, handler] of methodRoutes) {
    const regex = new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
    const match = url.replace(/\?.*$/, "").match(regex);
    if (match) return { handler, params: match.groups ?? {} };
  }
  return null;
}

/**
 * Resolve a registered route handler + URL params without going through the
 * adapter. Dành cho test: adapter thật có delay 200–500ms và 5% lỗi 500 ngẫu
 * nhiên nên không test qua axios được (flaky).
 */
export function resolveMockRoute(
  method: string,
  url: string,
): { handler: RouteHandler; params: Record<string, string> } | null {
  return matchRoute(method, url);
}

/* ── Adapter ─────────────────────────────────────────────────────────── */

/**
 * Resolves once `registerAllMockRoutes()` has run. `activateMockAdapter()`
 * sets this before any request can reach `mockAdapter` (see below) — the
 * adapter itself awaits it, closing the race where a request fired before
 * the dynamic import of `./mock-routes` finished would find no routes
 * registered yet and get a bogus 404.
 */
let routesReady: Promise<void> | undefined;
const networkAdapter = axios.getAdapter(api.defaults.adapter);

async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  // Mock identity uses the same HttpOnly BFF boundary as production.
  if (
    (config.baseURL === AUTH_API_BASE &&
      Object.values(AUTH_PATHS).some((path) => path === config.url)) ||
    config.url === PERMISSION_QUERY.path ||
    config.url === "/identity/roles" ||
    config.url?.startsWith("/identity/roles/")
  )
    return networkAdapter(config);
  if (routesReady) await routesReady;

  const url = config.url ?? "/";
  const method = (config.method ?? "GET").toUpperCase();

  const matched = matchRoute(method, url);
  if (!matched) {
    console.warn(`[mock-adapter] No handler for ${method} ${url}`);
    return settleMockResponse({ status: 404, data: { message: "Not found" }, headers: {} }, config);
  }

  // Simulate latency
  await delay();

  // 5% random server error for resilience testing
  if (Math.random() < 0.05) {
    return settleMockResponse(
      {
        status: 500,
        data: {
          code: "MOCK_RANDOM_ERROR",
          message: "Lỗi ngẫu nhiên từ mock server (5% chance)",
          traceId: `mock-${Date.now()}`,
        },
        headers: {},
      },
      config,
    );
  }

  // Handler nhận config có query string (axios không tự serialize cho custom
  // adapter) + URL params đã match.
  const handlerConfig = withQueryString(config);
  (handlerConfig as AxiosRequestConfig & { _mockParams: Record<string, string> })._mockParams =
    matched.params;

  return settleMockResponse(await matched.handler(handlerConfig), config);
}

function settleMockResponse(response: MockResponse, config: AxiosRequestConfig): AxiosResponse {
  const axiosResponse: AxiosResponse = {
    data: response.data,
    status: response.status,
    statusText: response.statusText ?? String(response.status),
    headers: response.headers,
    config: config as InternalAxiosRequestConfig,
    request: undefined,
  };
  const validateStatus =
    config.validateStatus ?? ((status: number) => status >= 200 && status < 300);
  if (!validateStatus(response.status)) {
    throw new AxiosError(
      getMockErrorMessage(response.data),
      undefined,
      config as InternalAxiosRequestConfig,
      undefined,
      axiosResponse,
    );
  }
  return axiosResponse;
}

function getMockErrorMessage(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }
  return "Mock request failed";
}

/* ── Activate ────────────────────────────────────────────────────────── */

export function activateMockAdapter(): void {
  // Register all mock routes before activating the adapter. The dynamic
  // import is async even though the module is already bundled, so the
  // adapter must await `routesReady` (set below) rather than assume routes
  // exist by the time the first request arrives.
  routesReady = Promise.all([
    import("./mock-routes"),
    import("./mock-routes-suppliers"),
    import("./mock-routes-purchase-orders"),
    import("./mock-routes-orders"),
    import("./mock-routes-goods-receipts"),
    import("./mock-routes-variants"),
  ]).then(
    ([
      { registerAllMockRoutes },
      { registerSupplierMockRoutes },
      { registerPurchaseOrderMockRoutes },
      { registerOrderMockRoutes },
      { registerGoodsReceiptMockRoutes },
      { registerVariantMockRoutes },
    ]) => {
      registerAllMockRoutes();
      registerSupplierMockRoutes();
      registerPurchaseOrderMockRoutes();
      registerOrderMockRoutes();
      registerGoodsReceiptMockRoutes();
      registerVariantMockRoutes();
    },
  );

  api.defaults.adapter = mockAdapter;
  console.info("[mock-adapter] Activated — feature data is mocked; auth uses the BFF");
}

/** Auth mocks obtain staff data only through the adapter boundary. */
export async function getMockStaffUsers() {
  const { staffUsers } = await import("@/lib/mock-data");
  return staffUsers;
}
