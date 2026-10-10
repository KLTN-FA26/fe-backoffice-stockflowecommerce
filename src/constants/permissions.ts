/**
 * Mã quyền thật của BE (`<resource>:<ACTION>`), đọc từ `GET /identity/me/permissions`
 * (BE PR #39). Không gắn cứng theo tên vai trò — admin đổi quyền trên màn Phân quyền là
 * có hiệu lực ngay.
 */

/** Màn NCC — resource `procurement-suppliers` (BE SupplierController, PR #36). */
export const SUPPLIER_PERMISSIONS = {
  viewPage: "procurement-suppliers:VIEW_PAGE",
  read: "procurement-suppliers:READ",
  create: "procurement-suppliers:CREATE",
  // Sửa và đổi trạng thái qua PUT có `status`
  update: "procurement-suppliers:UPDATE",
  // Ngừng hợp tác = DELETE
  delete: "procurement-suppliers:DELETE",
  // Xuất dữ liệu hàng loạt — BE coi là quyền nhạy cảm, tách khỏi READ (Action.EXPORT)
  export: "procurement-suppliers:EXPORT",
} as const;

/**
 * Đơn hàng — resource `sales-orders` (BE `OrderResources.ORDERS`). Huỷ đơn phía admin
 * (`POST /orders/{id}/admin-cancellation`) yêu cầu APPROVE scope ALL; seed BE chỉ cấp cho
 * ORDER_COORDINATOR (SALES_STAFF chỉ có VIEW_PAGE/READ/CREATE/UPDATE).
 */
export const ORDER_PERMISSIONS = {
  // Mở trang (menu + chặn route) — BE Action.VIEW_PAGE, ADR-0004
  viewPage: "sales-orders:VIEW_PAGE",
  // Đọc dữ liệu (GET /orders, /orders/{id}) — seed BE: SALES_STAFF, ORDER_COORDINATOR
  read: "sales-orders:READ",
  cancel: "sales-orders:APPROVE",
} as const;

/**
 * Phiếu nhận hàng — resource `procurement-goods-receipts` (BE GoodsReceiptController, PR #62).
 * Kiểm đếm, xác nhận, huỷ DRAFT và chuyển hàng sang khu QC đều là UPDATE.
 */
export const GOODS_RECEIPT_PERMISSIONS = {
  viewPage: "procurement-goods-receipts:VIEW_PAGE",
  read: "procurement-goods-receipts:READ",
  create: "procurement-goods-receipts:CREATE",
  update: "procurement-goods-receipts:UPDATE",
  approve: "procurement-goods-receipts:APPROVE",
} as const;

/**
 * Kết luận QC dòng nhận — resource `procurement-qc-tasks` (BE `POST …/lines/{id}/inspection`,
 * PR #62). Tách khỏi quyền phiếu nhận: NV QC kết luận, NV kho không (docs 03 §2).
 */
export const QC_TASK_PERMISSIONS = {
  viewPage: "procurement-qc-tasks:VIEW_PAGE",
  read: "procurement-qc-tasks:READ",
  approve: "procurement-qc-tasks:APPROVE",
} as const;

/**
 * Màn Đơn đặt NCC — resource `procurement-purchase-orders` (BE PurchaseOrderController).
 * VIEW_PAGE chỉ dùng cho menu + chặn route; mọi API đọc cần READ (BE Action.java, ADR-0004).
 */
export const PO_PERMISSIONS = {
  viewPage: "procurement-purchase-orders:VIEW_PAGE",
  read: "procurement-purchase-orders:READ",
  create: "procurement-purchase-orders:CREATE",
  // Gửi NCC, huỷ, nhận hàng, đóng thiếu, ghi nhận NCC phản hồi
  update: "procurement-purchase-orders:UPDATE",
  // Phê duyệt + khôi phục gửi NCC (`/delivery-recovery`)
  approve: "procurement-purchase-orders:APPROVE",
  export: "procurement-purchase-orders:EXPORT",
} as const;

/**
 * Sản phẩm, biến thể, logistics theo SKU, ảnh theo biến thể — resource `product-products`
 * (BE ProductResources.PRODUCTS, PR #71).
 */
export const PRODUCT_PERMISSIONS = {
  viewPage: "product-products:VIEW_PAGE",
  read: "product-products:READ",
  create: "product-products:CREATE",
  // Sửa nháp, thêm / sửa / chặn biến thể, logistics, tải ảnh lên
  update: "product-products:UPDATE",
  // Duyệt (bốn mắt), kích hoạt / ngừng biến thể, xuất bản ảnh
  approve: "product-products:APPROVE",
} as const;

/** BE develop IdentityResources / IdentityController: read-only RBAC screen APIs. */
export const IDENTITY_PERMISSIONS = {
  rolesRead: "identity-roles:READ",
  rbacRead: "identity-rbac:READ",
  rbacApprove: "identity-rbac:APPROVE",
} as const;

export const PERMISSION_QUERY = {
  path: "/identity/me/permissions",
  staleTime: 30_000,
} as const;
export const PERMISSION_UI = {
  deniedTitle: "Không có quyền truy cập",
  deniedDescription: "Bạn không có quyền mở trang này.",
  errorTitle: "Không thể tải quyền truy cập",
  retry: "Thử lại",
  productCreateDenied: "Bạn không có quyền tạo sản phẩm.",
  demoContext: "Chỉ đổi nhãn vai trò demo; quyền vẫn lấy từ phiên đăng nhập.",
} as const;
