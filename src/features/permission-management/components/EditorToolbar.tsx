import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";

import { RBAC_EDITOR } from "../constants";

import type { PermissionEditor } from "../use-permission-editor";

export function EditorToolbar({
  editor,
  onReload,
  refetchError,
}: {
  editor: PermissionEditor;
  onReload: () => Promise<void>;
  refetchError: boolean;
}) {
  const [confirmReload, setConfirmReload] = useState(false);
  return (
    <div className="space-y-3">
      {!editor.canEdit && (
        <p className="text-ink-secondary text-sm">
          {editor.roleReadOnly ? RBAC_EDITOR.readOnly : RBAC_EDITOR.noApprove}
        </p>
      )}
      {editor.dirty && (
        <p role="status" className="text-ink-secondary text-sm">
          {RBAC_EDITOR.dirty}
        </p>
      )}
      {(editor.changed || editor.message || refetchError) && (
        <div role="alert" className="text-warning text-sm">
          {editor.message || (editor.changed ? RBAC_EDITOR.changed : RBAC_EDITOR.refetchFailed)}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          disabled={!editor.canEdit || !editor.dirty || editor.pending}
          aria-busy={editor.pending}
          onClick={() => void editor.save()}
        >
          {editor.reloading
            ? RBAC_EDITOR.reloading
            : editor.pending
              ? RBAC_EDITOR.saving
              : RBAC_EDITOR.save}
        </Button>
        <Button
          variant="outline"
          disabled={editor.pending}
          onClick={() => (editor.dirty ? setConfirmReload(true) : void onReload())}
        >
          {RBAC_EDITOR.reload}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReload}
        onOpenChange={setConfirmReload}
        title={RBAC_EDITOR.reloadTitle}
        description={RBAC_EDITOR.reloadDescription}
        confirmLabel={RBAC_EDITOR.discard}
        onConfirm={() => void onReload()}
      />
    </div>
  );
}
