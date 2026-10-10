import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { RoleResponse } from "../types";

interface RoleSelectorProps {
  disabled?: boolean;
  roles: readonly RoleResponse[];
  value: string;
  onChange: (roleCode: string) => void;
}

export function RoleSelector({ roles, value, onChange, disabled }: RoleSelectorProps) {
  return (
    <div className="border-border-default bg-bg-surface rounded-[var(--r-sm)] border p-4">
      <Label htmlFor="permission-role" className="text-ink-primary text-sm font-semibold">
        Vai trò
      </Label>
      <p className="text-ink-secondary mt-1 text-xs">Chọn vai trò để xem ma trận quyền.</p>
      <Select disabled={disabled} value={value} onValueChange={onChange}>
        <SelectTrigger
          id="permission-role"
          aria-label="Chọn vai trò để xem ma trận quyền"
          className="mt-3 w-full sm:max-w-md"
        >
          <SelectValue placeholder="Chọn vai trò" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.code} value={role.code}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
