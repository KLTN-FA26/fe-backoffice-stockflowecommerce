import { PRODUCT_PERMISSIONS } from "@/constants/permissions";

import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { Suspense } from "react";

import { ProductList } from "@/features/product/components/ProductList";

import { PageSkeleton } from "@/components/shared/PageSkeleton";

export default function ProductsPage() {
  return (
    <PermissionBoundary
      permissions={[PRODUCT_PERMISSIONS.viewPage, PRODUCT_PERMISSIONS.read]}
      variant="list"
    >
      <Suspense fallback={<PageSkeleton variant="list" />}>
        <ProductList />
      </Suspense>
    </PermissionBoundary>
  );
}
