import { LockKeyhole } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";

import { Badge } from "@/components/ui/badge";

import { PermissionGroup } from "./PermissionGroup";

import type { PermissionEditor } from "../use-permission-editor";
import type { RoleMatrix } from "../types";

export function PermissionMatrix({
  matrix,
  editor,
}: {
  matrix: RoleMatrix;
  editor?: PermissionEditor;
}) {
  return (
    <div className="space-y-5">
      <section className="border-border-default bg-bg-surface rounded-[var(--r-sm)] border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-ink-tertiary text-xs font-medium tracking-wide uppercase">
              Ma trận quyền
            </p>
            <h1 className="text-ink-primary mt-1 text-xl font-bold">{matrix.roleLabel}</h1>
            <p className="text-ink-secondary mt-1 font-[family-name:var(--font-mono)] text-xs">
              {matrix.roleCode}
            </p>
          </div>
          {matrix.systemRole && (
            <Badge variant="outline" className="border-brand/40 text-brand">
              <LockKeyhole aria-hidden="true" />
              <span>System role</span>
            </Badge>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Phạm vi dữ liệu: {matrix.dataScope}</Badge>
          <Badge variant="secondary">
            {matrix.grantedCount}/{matrix.totalCount} quyền được cấp
          </Badge>
        </div>
      </section>

      {matrix.groups.length > 0 ? (
        matrix.groups.map((group, index) => (
          <PermissionGroup key={index} group={group} editor={editor} />
        ))
      ) : (
        <EmptyState
          title="Chưa có nhóm quyền"
          description="Vai trò này chưa có dữ liệu ma trận để hiển thị."
        />
      )}
    </div>
  );
}
