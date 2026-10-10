import { PRODUCT_PERMISSIONS } from "@/constants/permissions";

import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { ProductDetail } from "@/features/product/components/ProductDetail";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissionBoundary permissions={[PRODUCT_PERMISSIONS.viewPage, PRODUCT_PERMISSIONS.read]}>
      <ProductDetail params={params} />
    </PermissionBoundary>
  );
}
