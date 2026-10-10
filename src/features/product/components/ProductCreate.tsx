"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";

import { ADMIN_ROUTES, PRODUCT_STATUS, PRODUCT_PERMISSIONS } from "@/constants";

import { ApiError } from "@/lib/api";
import { useCan } from "@/lib/auth/components/Can";

import {
  buildCreateProductInput,
  mapCreateProductError,
  PRODUCT_DRAFT_FORM_DEFAULTS,
  productDraftFormSchema,
  productToDraftForm,
  useBrands,
  useCategories,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from "@/features/product";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Button } from "@/components/ui/button";

import { ProductMasterFields } from "./ProductMasterFields";
import { ProductFormBackLink, ProductFormForbidden } from "./ProductFormNavigation";

import type { Product, ProductDraftFormValues } from "@/features/product";

export function ProductCreate({ productId }: { productId?: string }) {
  const isEditing = Boolean(productId);
  const router = useRouter();
  const canSave = useCan(isEditing ? PRODUCT_PERMISSIONS.update : PRODUCT_PERMISSIONS.create);
  const productQuery = useProduct(productId);
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data?.items ?? [];
  const brandsQuery = useBrands();
  const brands = brandsQuery.data ?? [];
  const [serverMessage, setServerMessage] = useState<string>();
  const form = useForm<ProductDraftFormValues>({
    defaultValues: PRODUCT_DRAFT_FORM_DEFAULTS,
    resolver: zodResolver(productDraftFormSchema),
  });
  const { isDirty } = form.formState;

  useEffect(() => {
    const product = productQuery.data;
    if (!product || isDirty) return;
    form.reset(productToDraftForm(product));
  }, [form, isDirty, productQuery.data]);

  const handleError = (error: unknown) => {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(0, "UNKNOWN_ERROR", "Không lưu được sản phẩm.");
    const mapped = mapCreateProductError(apiError);
    for (const [field, message] of Object.entries(mapped.fieldErrors)) {
      if (!message) continue;
      if (field in PRODUCT_DRAFT_FORM_DEFAULTS) {
        form.setError(field as keyof ProductDraftFormValues, { type: "server", message });
      }
    }
    setServerMessage(mapped.message);
  };

  const onSuccess = (saved: Product) => {
    setServerMessage(undefined);
    form.reset(productToDraftForm(saved));
    router.push(ADMIN_ROUTES.products.detail(saved.productId));
  };
  const createMutation = useCreateProduct({ onError: handleError, onSuccess });
  const updateMutation = useUpdateProduct({ onError: handleError, onSuccess });
  const isPending = createMutation.isPending || updateMutation.isPending;

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    const input = buildCreateProductInput(values);
    if (productId) {
      const { code: _code, ...update } = input;
      updateMutation.mutate({ id: productId, ...update });
    } else {
      createMutation.mutate(input);
    }
  });

  if ((isEditing && productQuery.isLoading) || categoriesQuery.isLoading || brandsQuery.isLoading) {
    return <PageSkeleton variant="form" />;
  }
  if (!canSave) return <ProductFormForbidden isEditing={isEditing} />;
  if (isEditing && productQuery.isError) {
    return (
      <EmptyState
        title="Không tải được sản phẩm"
        description="Không thể mở dữ liệu để chỉnh sửa. Hãy thử lại từ trang danh sách."
      />
    );
  }
  if (isEditing && productQuery.data && productQuery.data.status !== PRODUCT_STATUS.DRAFT) {
    return (
      <EmptyState
        title="Không thể chỉnh sửa sản phẩm"
        description={`Chỉ sản phẩm ở trạng thái Draft mới được chỉnh sửa. Sản phẩm này đang ở trạng thái ${productQuery.data.status}.`}
        action={<ProductFormBackLink />}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={isEditing ? "Chỉnh sửa sản phẩm" : "Tạo sản phẩm"}
        subtitle="Lưu Product master ở trạng thái Draft; SKU và Inventory Item thuộc các API tiếp theo."
        actions={<ProductFormBackLink />}
      />
      <form onSubmit={submit} noValidate className="space-y-4 pb-16">
        {serverMessage && (
          <div
            role="alert"
            className="border-danger/30 bg-danger/5 text-danger rounded-[var(--r-sm)] border px-4 py-3 text-sm"
          >
            <p className="font-semibold">Không lưu được sản phẩm</p>
            <p className="mt-1">{serverMessage}</p>
          </div>
        )}
        <ProductMasterFields
          brands={brands}
          categories={categories}
          form={form}
          isEditing={isEditing}
        />
        <div className="border-border-default bg-bg-subtle sticky bottom-0 flex justify-end border-t p-3">
          <Button
            type="submit"
            disabled={isPending}
            className="bg-brand text-ink-inverse hover:bg-brand-hover rounded-[var(--r-sm)]"
          >
            <Save className="size-4" />
            {isPending ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo bản nháp"}
          </Button>
        </div>
      </form>
    </>
  );
}
