import "server-only";

import {
  GOODS_RECEIPT_PERMISSIONS,
  IDENTITY_PERMISSIONS,
  ORDER_PERMISSIONS,
  PO_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  QC_TASK_PERMISSIONS,
  SUPPLIER_PERMISSIONS,
} from "@/constants/permissions";

import type { PermissionCode } from "@/lib/auth/me-permissions";

// Seed BE V20260903000100: goods-receipts VIEW_PAGE/READ/CREATE/UPDATE cho WAREHOUSE_STAFF,
// WAREHOUSE_MANAGER, PROCUREMENT_STAFF; QC_STAFF chỉ VIEW_PAGE/READ + qc-tasks:APPROVE.
// WAREHOUSE_STAFF KHÔNG có purchase-orders:READ (đã chốt giữ nguyên seed, SCRUM-436).
const GR = GOODS_RECEIPT_PERMISSIONS;
const QC = QC_TASK_PERMISSIONS;
const GR_WORK = [GR.viewPage, GR.read, GR.create, GR.update];

/** Explicit demo session responses keyed by existing staff IDs, never computed from roles. */
const MOCK_USER_GRANTS: Record<string, readonly PermissionCode[]> = {
  "USER-ADMIN-01": [
    ...Object.values(SUPPLIER_PERMISSIONS),
    ...Object.values(PO_PERMISSIONS),
    ...Object.values(ORDER_PERMISSIONS),
    ...Object.values(PRODUCT_PERMISSIONS),
    ...Object.values(IDENTITY_PERMISSIONS),
    ...Object.values(GR),
    ...Object.values(QC),
  ],
  "USER-PROC-01": [
    SUPPLIER_PERMISSIONS.viewPage,
    SUPPLIER_PERMISSIONS.read,
    SUPPLIER_PERMISSIONS.create,
    SUPPLIER_PERMISSIONS.update,
    SUPPLIER_PERMISSIONS.export,
    PO_PERMISSIONS.viewPage,
    PO_PERMISSIONS.read,
    PO_PERMISSIONS.create,
    PO_PERMISSIONS.update,
    PO_PERMISSIONS.export,
    ...GR_WORK,
    QC.viewPage,
    QC.read,
  ],
  "USER-PLAN-01": [],
  "USER-WH-01": GR_WORK,
  "USER-WH-02": GR_WORK,
  "USER-WH-03": GR_WORK,
  "USER-WH-04": GR_WORK,
  "USER-QC-01": [GR.viewPage, GR.read, QC.viewPage, QC.read, QC.approve],
  "USER-ACC-01": [SUPPLIER_PERMISSIONS.viewPage, SUPPLIER_PERMISSIONS.read],
  "USER-ECAD-01": [...Object.values(PRODUCT_PERMISSIONS), ...Object.values(SUPPLIER_PERMISSIONS)],
  "USER-SALE-01": [ORDER_PERMISSIONS.viewPage, ORDER_PERMISSIONS.read],
  "USER-SALE-02": [ORDER_PERMISSIONS.viewPage, ORDER_PERMISSIONS.read],
  "USER-SALE-03": [ORDER_PERMISSIONS.viewPage, ORDER_PERMISSIONS.read],
  "USER-COORD-01": Object.values(ORDER_PERMISSIONS),
};

export function mockSessionPermissions(userId: string, roles: readonly string[]) {
  return {
    roles: [...roles],
    permissions: [...(MOCK_USER_GRANTS[userId] ?? [])].sort(),
    dataScope: "ALL" as const,
  };
}
