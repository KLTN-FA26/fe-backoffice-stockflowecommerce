import { create } from "zustand";

import { useAuthStore } from "@/lib/auth/auth-store";

import type { PermissionCode } from "@/lib/auth/me-permissions";
import type { RoleMatrix } from "./types";

export type MatrixDraft = { base: RoleMatrix; grants: Set<PermissionCode> };
type EditorState = {
  owner: string | null;
  epoch: number;
  selectedRoleCode: string;
  draft: MatrixDraft | null;
  message: string;
  blocked: boolean;
  operation: "saving" | "reloading" | null;
  setSelectedRoleCode: (value: string) => void;
  setDraft: (value: MatrixDraft | null) => void;
  setMessage: (value: string) => void;
  setBlocked: (value: boolean) => void;
  setOperation: (value: EditorState["operation"]) => void;
};
const empty = (owner: string | null) => ({
  owner,
  selectedRoleCode: "",
  draft: null,
  message: "",
  blocked: false,
  operation: null,
});
/** One active UI draft in memory only; survives same-user guard remounts, never persists. */
export const useRbacEditorStore = create<EditorState>((set) => ({
  ...empty(useAuthStore.getState().user?.userId ?? null),
  epoch: 0,
  setSelectedRoleCode: (selectedRoleCode) => set({ selectedRoleCode }),
  setDraft: (draft) => set({ draft }),
  setMessage: (message) => set({ message }),
  setBlocked: (blocked) => set({ blocked }),
  setOperation: (operation) => set({ operation }),
}));
export function clearRbacEditor(owner = useAuthStore.getState().user?.userId ?? null) {
  useRbacEditorStore.setState({ ...empty(owner), epoch: useRbacEditorStore.getState().epoch + 1 });
}
// Unknown during focus bootstrap is not logout. Authentication/permissions still gate all rendering.
useAuthStore.subscribe((state) => {
  if (state.status === "unauthenticated") clearRbacEditor(null);
  else if (
    state.status === "authenticated" &&
    state.user?.userId !== useRbacEditorStore.getState().owner
  )
    clearRbacEditor(state.user?.userId ?? null);
});
