import { PRODUCT_PERMISSIONS } from "@/constants/permissions";

import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { ProductCreate } from "@/features/product/components/ProductCreate";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionBoundary
      permissions={[
        PRODUCT_PERMISSIONS.viewPage,
        PRODUCT_PERMISSIONS.read,
        PRODUCT_PERMISSIONS.update,
      ]}
    >
      <ProductCreate productId={id} />
    </PermissionBoundary>
  );
}
