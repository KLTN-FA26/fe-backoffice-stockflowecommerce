/**
 * Render màn PO trong test với API giả lập theo URL — đi qua đúng chuỗi thật:
 * `/identity/me/permissions` → useCan → UI. Bộ quyền theo MÃ QUYỀN, không theo vai trò
 * (theo mẫu `features/supplier/__fixtures__/render.tsx`).
 */

import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { vi } from "vitest";

import { GOODS_RECEIPT_PERMISSIONS, PO_PERMISSIONS, SUPPLIER_PERMISSIONS } from "@/constants";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";

import type { PermissionCode } from "@/lib/auth";

const P = PO_PERMISSIONS;

export const PO_PERMISSION_SETS = {
  none: [],
  // VIEW_PAGE = mở trang; READ = được gọi API dữ liệu (BE Action.java, ADR-0004)
  viewOnly: [P.viewPage],
  readOnly: [P.viewPage, P.read],
  // Seed BE PROCUREMENT_STAFF: tạo + gửi/huỷ/đóng thiếu, không duyệt; tạo được phiếu nhận
  procurement: [
    P.viewPage,
    P.read,
    P.create,
    P.update,
    P.export,
    SUPPLIER_PERMISSIONS.read,
    // Seed BE PROCUREMENT_STAFF: goods-receipts VIEW_PAGE/READ/CREATE/UPDATE
    GOODS_RECEIPT_PERMISSIONS.viewPage,
    GOODS_RECEIPT_PERMISSIONS.create,
  ],
  // BE #40 WAREHOUSE_MANAGER: chỉ duyệt
  approver: [P.viewPage, P.read, P.approve],
  full: [
    ...Object.values(P),
    SUPPLIER_PERMISSIONS.read,
    GOODS_RECEIPT_PERMISSIONS.viewPage,
    GOODS_RECEIPT_PERMISSIONS.create,
  ],
} satisfies Record<string, PermissionCode[]>;

/** Handler theo path: trả data, hoặc throw (vd ApiError) để giả lập lỗi. */
export type RouteHandler = (params: unknown, body?: unknown) => unknown;

/** Giả lập `api.get` (+ tuỳ chọn `api.post`) theo URL. Trả spy để kiểm params đã gửi. */
export function mockApi(
  permissions: readonly PermissionCode[],
  routes: Record<string, RouteHandler>,
  postRoutes: Record<string, RouteHandler> = {},
) {
  const get = vi
    .spyOn(api, "get")
    .mockImplementation(async (url: string, config?: { params?: unknown }) => {
      if (url === "/identity/me/permissions") {
        return { data: { roles: ["TEST"], permissions: [...permissions], dataScope: "ALL" } };
      }
      const handler = routes[url];
      if (!handler) throw new Error(`Không có mock cho GET ${url}`);
      return { data: handler(config?.params) };
    });
  const post = vi.spyOn(api, "post").mockImplementation(async (url: string, body?: unknown) => {
    const handler = postRoutes[url];
    if (!handler) throw new Error(`Không có mock cho POST ${url}`);
    return { data: handler(undefined, body) };
  });
  return { get, post };
}

export function renderPoScreen(ui: React.ReactElement, searchParams = "") {
  useAuthStore.setState({
    user: {
      userId: "u-test",
      fullName: "Test",
      email: "t@t.vn",
      roles: [],
      username: "test",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    isAuthenticated: true,
    status: "authenticated",
    impersonatedRole: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {/* hasMemory: URL đổi thì giữ lại như trình duyệt thật (không quay về searchParams đầu). */}
      <NuqsTestingAdapter searchParams={searchParams} hasMemory>
        <Suspense fallback={<div>loading</div>}>{ui}</Suspense>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}

/** PurchaseOrderResponse đúng hình BE (nhánh `test`), ghi đè field theo case. */
export function bePo(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrderId: "11111111-1111-4111-8111-111111111111",
    poNumber: "PO-20261002-000001",
    type: "STANDARD",
    productionOrderId: null,
    supplierId: "22222222-2222-4222-8222-222222222222",
    supplierCode: "GOHOAPHAT",
    supplierName: "Gỗ Hòa Phát",
    warehouseId: "d99123fd-2997-4751-6bb9-e10a2e6d9949",
    warehouseCode: "HCM",
    warehouseName: "Kho Hồ Chí Minh",
    status: "DRAFT",
    currency: "VND",
    orderDate: "2026-10-01",
    subtotal: 1000000,
    taxTotal: 0,
    totalAmount: 1000000,
    note: null,
    expectedAt: "2099-01-01",
    lines: [bePoLine()],
    createdAt: "2026-10-01T03:00:00Z",
    createdBy: "procurement",
    lastModifiedAt: "2026-10-01T03:00:00Z",
    lastModifiedBy: "procurement",
    possibleDuplicate: false,
    revisionNo: 0,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    confirmedBy: null,
    confirmedAt: null,
    closedAt: null,
    closeKind: null,
    closeReason: null,
    cancellationReason: null,
    paymentTermDays: 30,
    leadTimeDays: 7,
    sentAt: null,
    supplierConfirmationStatus: "NOT_SENT",
    supplierRespondedAt: null,
    supplierReference: null,
    supplierResponseNote: null,
    deliveryStatus: "NOT_SENT",
    ...overrides,
  };
}

/** Một dòng `PurchaseOrderResponse.lines` của BE (PR #71). */
export function bePoLine(overrides: Record<string, unknown> = {}) {
  return {
    lineId: "33333333-3333-4333-8333-333333333333",
    lineNo: 1,
    inventoryItemId: "44444444-4444-4444-8444-444444444444",
    sku: "SOFA-3S-GREY",
    description: "Sofa 3 chỗ",
    uom: "EACH",
    quantityOrdered: 10,
    quantityReceived: 0,
    openQuantity: 10,
    unitPrice: 100000,
    taxRate: 0,
    lineTotal: 1000000,
    status: "OPEN",
    ...overrides,
  };
}

/** PageResponse BE (trang từ 0). */
export function bePage<T>(items: T[], page = 0, size = 15) {
  return {
    items,
    page,
    size,
    totalElements: items.length,
    totalPages: items.length ? 1 : 0,
    hasNext: false,
    hasPrevious: page > 0,
  };
}

export const SUPPLIER_REF = {
  supplierId: "22222222-2222-4222-8222-222222222222",
  code: "GOHOAPHAT",
  name: "Gỗ Hòa Phát",
  contactName: null,
  email: "po@gohoaphat.vn",
  phone: null,
  taxCode: null,
  status: "ACTIVE",
  paymentTermDays: 30,
  leadTimeDays: 7,
  communicationChannel: "EMAIL",
  apiEndpoint: null,
  createdAt: "2026-09-01T00:00:00Z",
  lastModifiedAt: "2026-09-01T00:00:00Z",
};

/**
 * Chọn một mục của shadcn `Select` (Radix): bấm trigger theo nhãn rồi bấm option.
 * jsdom thiếu pointer capture / scrollIntoView mà Radix gọi khi mở danh sách → vá rỗng.
 */
export async function pickSelectOption(
  user: { click: (el: Element) => Promise<void> },
  trigger: string | RegExp,
  option: string | RegExp,
) {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  await user.click(await screen.findByRole("combobox", { name: trigger }));
  await user.click(await screen.findByRole("option", { name: option }));
}
