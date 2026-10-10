import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_PERMISSIONS } from "@/constants";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";

import { VariantsSection } from "./VariantsSection";

import type { PermissionCode } from "@/lib/auth";

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const variant = (over: Record<string, unknown> = {}) => ({
  variantId: "v-1",
  productId: PRODUCT,
  sku: "CUP-12OZ",
  name: "Ly 12oz",
  status: "ACTIVE",
  defaultVariant: true,
  attributeSignature: "SIZE=12OZ",
  position: 0,
  obsoletedAt: null,
  version: 0,
  ...over,
});
const logistics = {
  skuId: "v-1",
  sku: "CUP-12OZ",
  version: 2,
  unitOfMeasure: "EACH",
  barcode: null,
  weightKg: 0.02,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  packageWeightKg: null,
  packageLengthCm: null,
  packageWidthCm: null,
  packageHeightCm: null,
  packageCount: 1,
  packSize: 50,
  storageClass: "NORMAL",
  requiresAdultSignature: false,
  shippingRestrictionNote: null,
  qcRequired: false,
};

afterEach(() => vi.restoreAllMocks());

function mockBe(permissions: readonly PermissionCode[], variants = [variant()]) {
  vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["TEST"], permissions: [...permissions], dataScope: "ALL" } };
    }
    if (url === `/products/${PRODUCT}/variants`) {
      return {
        data: {
          items: variants,
          page: 0,
          size: 200,
          totalElements: variants.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }
    if (url === `/products/${PRODUCT}/skus/v-1/logistics`) return { data: logistics };
    if (url === `/products/${PRODUCT}/variants/v-1/media`) return { data: [] };
    throw new Error(`Không có mock cho GET ${url}`);
  });
  const post = vi.spyOn(api, "post").mockImplementation(async (url: string) => {
    if (url.endsWith("/blocking")) return { data: variant({ status: "BLOCKED" }) };
    throw new Error(`Không có mock cho POST ${url}`);
  });
  const put = vi.spyOn(api, "put").mockResolvedValue({ data: { ...logistics, version: 3 } });
  return { post, put };
}

function Harness() {
  const query = useQuery({
    queryKey: ["variants", PRODUCT, "list"],
    queryFn: async () => {
      const { listVariants } = await import("../../variant-api");
      return listVariants(PRODUCT);
    },
  });
  return <VariantsSection productId={PRODUCT} productApproved query={query} />;
}

function renderSection() {
  // useMyPermissions chỉ gọi /identity/me/permissions khi đã đăng nhập.
  useAuthStore.setState({
    user: {
      userId: "u-test",
      fullName: "Test",
      email: "t@t.vn",
      roles: [],
      username: "test",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    isAuthenticated: true,
    status: "authenticated",
    impersonatedRole: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("VariantsSection — biến thể thật (BE PR #71), không còn bảng SKU mock", () => {
  it("chỉ xem: hiện biến thể, không có nút Thêm / thao tác", async () => {
    mockBe([PRODUCT_PERMISSIONS.read]);
    renderSection();
    expect(await screen.findByText("CUP-12OZ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm biến thể/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("CUP-12OZ"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByRole("button", { name: "Tạm chặn" })).not.toBeInTheDocument();
    expect(await within(panel).findByText("50/gói", { exact: false })).toBeInTheDocument();
  });

  it("UPDATE: tạm chặn phải qua dialog xác nhận rồi mới gọi /blocking; biến thể mặc định không có Ngừng dùng", async () => {
    const user = userEvent.setup();
    const { post } = mockBe([
      PRODUCT_PERMISSIONS.read,
      PRODUCT_PERMISSIONS.update,
      PRODUCT_PERMISSIONS.approve,
    ]);
    renderSection();
    await user.click(await screen.findByText("CUP-12OZ"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByRole("button", { name: "Ngừng dùng" })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Tạm chặn" }));
    expect(post).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("dialog", { name: "Tạm chặn biến thể?" });
    await user.click(within(confirm).getByRole("button", { name: "Tạm chặn" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/products/${PRODUCT}/variants/v-1/blocking`),
    );
  });

  it("sửa logistics gửi version của lần đọc (chống ghi đè)", async () => {
    const user = userEvent.setup();
    const { put } = mockBe([PRODUCT_PERMISSIONS.read, PRODUCT_PERMISSIONS.update]);
    renderSection();
    await user.click(await screen.findByText("CUP-12OZ"));
    const panel = await screen.findByRole("dialog");
    await user.click(await within(panel).findByRole("button", { name: /Sửa logistics/ }));
    await user.clear(within(panel).getByLabelText("Khối lượng (kg)"));
    await user.type(within(panel).getByLabelText("Khối lượng (kg)"), "0.03");
    await user.click(within(panel).getByRole("button", { name: "Lưu logistics" }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        `/products/${PRODUCT}/skus/v-1/logistics`,
        expect.objectContaining({
          version: 2,
          weightKg: 0.03,
          packSize: 50,
          storageClass: "NORMAL",
        }),
      ),
    );
  });
});
