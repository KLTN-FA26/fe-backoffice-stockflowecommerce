export const RBAC_EDITOR = {
  save: "Lưu thay đổi",
  saving: "Đang lưu...",
  reloading: "Đang tải lại...",
  saved: "Đã cập nhật quyền của vai trò.",
  reload: "Tải lại mới nhất",
  readOnly: "Vai trò này được máy chủ đánh dấu chỉ xem.",
  noApprove: "Bạn có quyền xem nhưng chưa có quyền phê duyệt thay đổi phân quyền.",
  changed: "Ma trận quyền đã thay đổi trên máy chủ. Tải lại trước khi lưu để tránh ghi đè.",
  lockout: "Máy chủ từ chối thay đổi vì phải còn ít nhất một vai trò có quyền quản lý phân quyền.",
  unknown:
    "Danh mục quyền không còn khớp với máy chủ. Bản nháp được giữ lại; hãy kiểm tra hoặc tải lại.",
  forbidden: "Bạn không còn quyền lưu thay đổi. Đang cập nhật quyền hiện tại.",
  privilegeEscalation: "Bạn không thể cấp hoặc quản lý quyền mà tài khoản của mình không có.",
  failed: "Không lưu được thay đổi. Bản nháp được giữ lại.",
  refetchFailed: "Không tải lại được ma trận. Bản nháp được giữ lại.",
  reloadTitle: "Bỏ thay đổi và tải lại?",
  reloadDescription: "Tải lại ma trận mới nhất sẽ bỏ toàn bộ thay đổi chưa lưu của vai trò này.",
  switchTitle: "Bỏ thay đổi chưa lưu?",
  switchDescription: "Chuyển vai trò sẽ bỏ toàn bộ thay đổi chưa lưu. Quay lại để giữ bản nháp.",
  discard: "Bỏ thay đổi",
  select: "Chọn tất cả quyền không nhạy cảm",
  clear: "Bỏ tất cả quyền không nhạy cảm",
  dirty: "Có thay đổi chưa lưu",
  subtitle: "Xem và chỉnh sửa quyền theo từng vai trò trong hệ thống.",
} as const;
export const RBAC_ERRORS = {
  conflict: "ROLE_PERMISSIONS_CHANGED",
  notEditable: "ROLE_NOT_EDITABLE",
  lockout: "RBAC_LOCKOUT",
  unknown: "UNKNOWN_PERMISSION",
  // BE PrivilegeGuard (403): granting a permission the caller does not hold.
  privilegeEscalation: "PRIVILEGE_ESCALATION",
} as const;
