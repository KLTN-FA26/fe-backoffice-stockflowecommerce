import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

import { RBAC_EDITOR } from "../constants";
import { matrixPermissionCode } from "../selectors";
import { PermissionActionChip } from "./PermissionActionChip";

import type { RoleMatrixResource } from "../types";
import type { PermissionEditor } from "../use-permission-editor";

export function PermissionResourceCard({
  resource,
  editor,
}: {
  resource: RoleMatrixResource;
  editor?: PermissionEditor;
}) {
  return (
    <article className="border-border-default bg-bg-surface rounded-[var(--r-sm)] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-ink-primary font-semibold">{resource.label}</h3>
          <p className="text-ink-tertiary mt-1 font-[family-name:var(--font-mono)] text-xs">
            {resource.code}
          </p>
        </div>
        <span className="text-ink-secondary shrink-0 text-xs tabular-nums">
          {resource.grantedCount}/{resource.totalCount} quyền được cấp
        </span>
      </div>

      {editor?.canEdit && resource.actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={editor.pending}
            aria-label={`${resource.label}: ${RBAC_EDITOR.select}`}
            onClick={() => editor.bulk([resource], true)}
          >
            {RBAC_EDITOR.select}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={editor.pending}
            aria-label={`${resource.label}: ${RBAC_EDITOR.clear}`}
            onClick={() => editor.bulk([resource], false)}
          >
            {RBAC_EDITOR.clear}
          </Button>
        </div>
      )}
      {resource.actions.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {resource.actions.map((action) => (
            <PermissionActionChip
              key={action.action}
              action={action}
              resourceLabel={resource.label}
              disabled={!editor?.canEdit || editor.pending}
              onToggle={() => editor?.toggle(matrixPermissionCode(resource.code, action.action))}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-4 py-6"
          title="Chưa có action"
          description="Resource này chưa khai báo action nào."
        />
      )}
    </article>
  );
}
