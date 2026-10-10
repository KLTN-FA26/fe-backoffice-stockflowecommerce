import { Check, LockKeyhole, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import type { RoleMatrixAction } from "../types";

export function PermissionActionChip({
  action,
  resourceLabel,
  disabled = true,
  onToggle,
}: {
  action: RoleMatrixAction;
  resourceLabel: string;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const stateLabel = action.granted ? "Được cấp" : "Chưa cấp";

  return (
    <div
      className={`border-border-default flex items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3 py-2 ${
        action.granted ? "bg-bg-subtle" : "bg-bg-surface"
      }`}
      aria-label={`${action.label} (${action.action}): ${stateLabel}${
        action.sensitive ? ", quyền nhạy cảm" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          checked={action.granted}
          disabled={disabled}
          onCheckedChange={() => {
            if (!disabled) onToggle?.();
          }}
          aria-label={`${resourceLabel}: ${action.label} (${action.action})`}
        />
        {action.granted ? (
          <Check className="text-positive size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Minus className="text-ink-tertiary size-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-ink-primary truncate text-sm font-medium">{action.label}</p>
          <p className="text-ink-tertiary font-[family-name:var(--font-mono)] text-[0.6875rem]">
            {action.action}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant={action.granted ? "secondary" : "outline"}>{stateLabel}</Badge>
        {action.sensitive && (
          <Badge variant="outline" className="text-warning border-warning/40">
            <LockKeyhole aria-hidden="true" />
            <span>Nhạy cảm</span>
          </Badge>
        )}
      </div>
    </div>
  );
}
