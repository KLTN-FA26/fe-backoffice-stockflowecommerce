import { PRODUCT_PERMISSIONS } from "@/constants/permissions";

import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { ProductCreate } from "@/features/product/components/ProductCreate";

export default function ProductCreatePage() {
  return (
    <PermissionBoundary permissions={[PRODUCT_PERMISSIONS.viewPage, PRODUCT_PERMISSIONS.create]}>
      <ProductCreate />
    </PermissionBoundary>
  );
}
