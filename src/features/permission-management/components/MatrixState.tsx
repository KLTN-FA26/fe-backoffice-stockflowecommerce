import { EditorToolbar } from "./EditorToolbar";
import { errorStatus, NotFoundState, RetryState, UnauthorizedState } from "./MatrixLoadStates";
import { PermissionMatrix } from "./PermissionMatrix";

import type { useRolePermissionMatrix } from "../queries";
import type { PermissionEditor } from "../use-permission-editor";

export function MatrixState({
  roleCode,
  matrixQuery,
  editor,
}: {
  roleCode: string;
  matrixQuery: ReturnType<typeof useRolePermissionMatrix>;
  editor: PermissionEditor;
}) {
  const status = errorStatus(matrixQuery.error);

  if (
    matrixQuery.isPending ||
    (matrixQuery.isFetching && matrixQuery.data?.roleCode !== roleCode)
  ) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-border-default rounded-[var(--r-sm)] border p-6"
      >
        <p className="text-ink-secondary text-sm">Đang tải ma trận của vai trò...</p>
      </div>
    );
  }
  if (status === 403) return <UnauthorizedState />;
  if (status === 404) return <NotFoundState />;
  if (!matrixQuery.data) {
    return <RetryState onRetry={() => void matrixQuery.refetch()} />;
  }
  if (matrixQuery.data.roleCode !== roleCode) {
    return <RetryState onRetry={() => void matrixQuery.refetch()} />;
  }

  return editor.matrix ? (
    <>
      <EditorToolbar
        editor={editor}
        refetchError={matrixQuery.isError}
        onReload={() => editor.reload(() => matrixQuery.refetch())}
      />
      <PermissionMatrix matrix={editor.matrix} editor={editor} />
    </>
  ) : null;
}
