import { describe, expect, it } from "vitest";

import { allowedProductActions, nextProductStatuses, isSelfApproval } from "./lifecycle";

import { PRODUCT_PERMISSIONS } from "@/constants/permissions";
import { hasPermission } from "@/lib/auth/me-permissions";

import type { ProductStatus } from "./types";

describe("product lifecycle", () => {
  it("allows product transitions from Draft per docs §5", () => {
    expect(nextProductStatuses("Draft")).toEqual(["Pending Approval"] satisfies ProductStatus[]);
  });

  it("gates Pending Approval actions by backend APPROVE permission", () => {
    expect(
      allowedProductActions("Pending Approval", (code) => code === PRODUCT_PERMISSIONS.approve).map(
        (action) => action.code,
      ),
    ).toEqual(["approve", "reject"]);
  });

  it("matches self approval only by the authenticated user UUID", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    expect(isSelfApproval(userId, userId)).toBe(true);
    expect(isSelfApproval(userId, "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(isSelfApproval(undefined, userId)).toBe(false);
  });

  it("uses the exact backend publication and discontinuation transitions", () => {
    expect(nextProductStatuses("Approved")).toEqual(["Published", "Discontinued"]);
    expect(nextProductStatuses("Published")).toEqual(["Approved", "Discontinued"]);
    expect(nextProductStatuses("Active")).toEqual([]);
  });

  it("product capabilities depend on returned grants, never role names", () => {
    expect(
      hasPermission(
        { roles: ["ROLE_SYSTEM_ADMIN"], permissions: [], dataScope: "ALL" },
        PRODUCT_PERMISSIONS.create,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        { roles: [], permissions: [PRODUCT_PERMISSIONS.create], dataScope: "ALL" },
        PRODUCT_PERMISSIONS.create,
      ),
    ).toBe(true);
    expect(allowedProductActions("Pending Approval", () => false)).toEqual([]);
  });
});
