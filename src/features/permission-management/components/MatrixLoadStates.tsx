import { RotateCcw } from "lucide-react";

import { ApiError } from "@/lib/api/error";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export function RetryState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Không tải được dữ liệu phân quyền"
      description="Kiểm tra kết nối hoặc thử tải lại."
      action={
        <Button
          type="button"
          onClick={onRetry}
          className="bg-brand text-ink-inverse hover:bg-brand-hover rounded-[var(--r-sm)]"
        >
          <RotateCcw className="size-3.5" />
          Tải lại
        </Button>
      }
    />
  );
}

export function UnauthorizedState({
  title = "Không có quyền xem ma trận phân quyền",
  description = "Bạn không có quyền xem ma trận phân quyền của vai trò này.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}

export function NotFoundState() {
  return (
    <EmptyState
      title="Không tìm thấy ma trận phân quyền"
      description="Vai trò có thể đã bị xoá hoặc không còn tồn tại."
    />
  );
}
