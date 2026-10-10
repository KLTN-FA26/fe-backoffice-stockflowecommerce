"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "cn";
import { BarChart3, Eye, Package, XCircle, Plus } from "lucide-react";
import { ADMIN_ROUTES, PAGE_SIZE, PRODUCT_PERMISSIONS, STORAGE_KEYS } from "@/constants";
import { PERMISSION_UI } from "@/constants/permissions";
import { usePageConfig } from "@/hooks/use-page-config";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useCan } from "@/lib/auth/components/Can";
import { STATUS_LABEL_VI } from "@/lib/status-map";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ListStatsPanel } from "@/components/shared/ListStatsPanel";
import { ListToolbar, type ListSummaryItem } from "@/components/shared/ListToolbar";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { toast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { statusCell, textCell } from "@/components/shared/column-helpers";
import { shouldFlagProductRow, useCategories, useProducts } from "@/features/product";
import { PRODUCT_LIST_FILTER_STATUSES, type ProductListFilterStatus } from "@/features/product/api";
import { getProductListEmptyState } from "@/features/product/product-list-state";
import { toProductApiPage, toProductUiPage } from "@/features/product/pagination";

import type { Product } from "@/features/product";

/*
 * Chỉ danh sách sản phẩm. Biến thể / SKU, logistics và ảnh nằm trong trang từng sản phẩm
 * (BE PR #71 `/products/{id}/variants`); BE không có danh sách SKU toàn hệ thống, nên tab "SKU"
 * cũ (gọi `/skus` không tồn tại) đã bỏ.
 */
type ProductStatusFilter = "all" | ProductListFilterStatus;
type ProductSearchField = "productId" | "name" | "category" | "type";
type ProductColumnSearchKey = "productId" | "name" | "category";
type ProductTableColumnKey = "productId" | "name" | "category" | "type" | "status" | "actions";

interface TabConfig<
  Status extends string,
  Field extends string,
  ColumnSearch extends string,
  Column extends string,
> {
  showStats: boolean;
  statuses: Status[];
  globalSearch: { query: string; fields: Field[] };
  columnSearch: Partial<Record<ColumnSearch, string>>;
  visibleColumns: Column[];
}

interface ProductsPageConfig {
  products: TabConfig<
    ProductStatusFilter,
    ProductSearchField,
    ProductColumnSearchKey,
    ProductTableColumnKey
  >;
}

const PRODUCT_DEFAULT_COLUMNS: ProductTableColumnKey[] = [
  "productId",
  "name",
  "category",
  "type",
  "status",
  "actions",
];
const DEFAULT_CONFIG: ProductsPageConfig = {
  products: {
    showStats: false,
    statuses: ["all"],
    globalSearch: { query: "", fields: ["productId", "name"] },
    columnSearch: {},
    visibleColumns: PRODUCT_DEFAULT_COLUMNS,
  },
};

const PRODUCT_STATUS_OPTIONS = ["all", ...PRODUCT_LIST_FILTER_STATUSES].map((value) => ({
  label: value === "all" ? "Tất cả" : (STATUS_LABEL_VI[value] ?? value),
  value: value as ProductStatusFilter,
}));
const PRODUCT_COLUMN_LABELS: Record<ProductTableColumnKey, string> = {
  productId: "Mã SP",
  name: "Tên sản phẩm",
  category: "Danh mục",
  type: "Loại",
  status: "Trạng thái",
  actions: "Thao tác",
};
function productCode(product: Product): string {
  return product.code ?? product.productId;
}

function categoryName(categoryId: string | null, categories: ReadonlyMap<string, string>): string {
  if (categoryId === null) return "Chưa chọn danh mục";
  return categories.get(categoryId) ?? "";
}

function mergeStoredConfig(
  stored: Partial<ProductsPageConfig>,
  fallback: ProductsPageConfig,
): ProductsPageConfig {
  return {
    products: {
      ...fallback.products,
      ...stored.products,
      globalSearch: { ...fallback.products.globalSearch, ...stored.products?.globalSearch },
      columnSearch: stored.products?.columnSearch ?? {},
      visibleColumns: stored.products?.visibleColumns?.length
        ? stored.products.visibleColumns
        : PRODUCT_DEFAULT_COLUMNS,
    },
  };
}

const PAGE_SUBTITLE = "Quản lý sản phẩm. Biến thể, logistics và ảnh nằm trong trang từng sản phẩm.";

export function ProductList() {
  const router = useRouter();
  const canCreateProduct = useCan(PRODUCT_PERMISSIONS.create);
  const productFilters = useUrlFilters(PRODUCT_LIST_FILTER_STATUSES, {
    keys: { page: "productPage", q: "productQ", status: "productStatus" },
  });
  const { config, setConfig } = usePageConfig<ProductsPageConfig>(
    STORAGE_KEYS.adminProductsConfig,
    DEFAULT_CONFIG,
    mergeStoredConfig,
  );
  const [prodSelectedKeys, setProdSelectedKeys] = useState<Set<string>>(new Set());
  const [productPageSize, setProductPageSize] = useState<number>(PAGE_SIZE.md);
  const [productSort, setProductSort] = useState<{
    key: "code" | "name" | "status";
    direction: "asc" | "desc";
  }>({ key: "code", direction: "asc" });

  const productsQuery = useProducts({
    // URL pages are human-facing/one-based; the shared API contract is backend/zero-based.
    page: toProductApiPage(productFilters.page),
    size: productPageSize,
    q: productFilters.debouncedQ.trim() || undefined,
    status: productFilters.status.length > 0 ? productFilters.status : undefined,
    sort: `${productSort.key},${productSort.direction}`,
  });
  const categoriesQuery = useCategories({});

  const rawProducts = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data?.items ?? [], [categoriesQuery.data]);
  const isLoading = productsQuery.isLoading || categoriesQuery.isLoading;
  const loadError = productsQuery.error ?? categoriesQuery.error;
  const productPage = productsQuery.data;
  const productPageNumber = productFilters.page;
  const setProductPage = productFilters.setPage;

  useEffect(() => {
    if (!productPage) return;
    const lastPage = Math.max(1, productPage.totalPages);
    if (productPageNumber > lastPage) void setProductPage(lastPage);
  }, [productPage, productPageNumber, setProductPage]);

  const productConfig = useMemo<ProductsPageConfig["products"]>(
    () => ({
      ...config.products,
      statuses: productFilters.status.length > 0 ? productFilters.status : ["all"],
      globalSearch: { ...config.products.globalSearch, query: productFilters.q },
    }),
    [config.products, productFilters.q, productFilters.status],
  );

  const categoryNameMap = useMemo(
    () => new Map(categories.map((category) => [category.categoryId, category.name.vi])),
    [categories],
  );

  const updateProductsConfig = (
    updater: (current: ProductsPageConfig["products"]) => ProductsPageConfig["products"],
  ) => setConfig((current) => ({ ...current, products: updater(current.products) }));
  const navigateToDetail = useCallback(
    (product: Product) => router.push(ADMIN_ROUTES.products.detail(product.productId)),
    [router],
  );
  const productStats = useMemo(
    () => [
      {
        label: "Tổng kết quả",
        value: (productPage?.totalElements ?? 0).toLocaleString("vi-VN"),
        icon: Package,
      },
    ],
    [productPage?.totalElements],
  );

  const productEmptyState = getProductListEmptyState({
    itemCount: rawProducts.length,
    total: productPage?.totalElements ?? 0,
    search: productFilters.q,
    statusCount: productFilters.status.length,
  });

  const toggleProductStatus = (status: ProductStatusFilter) => {
    if (status === "all") {
      productFilters.setStatus([]);
      return;
    }
    const next = productFilters.status.includes(status)
      ? productFilters.status.filter((item) => item !== status)
      : [...productFilters.status, status];
    productFilters.setStatus(next);
  };
  const productColumns: (ColumnDef<Product> & { key: ProductTableColumnKey })[] = [
    {
      key: "productId",
      header: "Mã SP",
      sortable: true,
      compare: (a, b) => productCode(a).localeCompare(productCode(b)),
      cell: (row) => (
        <Link
          href={ADMIN_ROUTES.products.detail(row.productId)}
          onClick={(e) => e.stopPropagation()}
          className="text-accent font-[family-name:var(--font-mono)] text-[0.8125rem] font-medium hover:underline"
        >
          {productCode(row)}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Tên sản phẩm",
      sortable: true,
      compare: (a, b) => a.name.localeCompare(b.name),
      cell: (row) => (
        <Link
          href={ADMIN_ROUTES.products.detail(row.productId)}
          onClick={(e) => e.stopPropagation()}
          className="text-ink-primary hover:text-accent text-[0.8125rem] font-medium hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      ...textCell<Product>(
        "category",
        "Danh mục",
        (row) => categoryName(row.categoryId, categoryNameMap) || "—",
        {
          color: "secondary",
        },
      ),
      key: "category",
    },
    {
      key: "type",
      header: "Loại",
      cell: (row) => (
        <span className="text-ink-secondary text-[0.8125rem]">
          {row.type === "Customizable" ? "Tùy chỉnh" : "Tiêu chuẩn"}
        </span>
      ),
    },
    statusCell<Product>("status", "Trạng thái", (row) => row.status, "product", {
      sortable: true,
      compare: (a, b) => a.status.localeCompare(b.status),
      withIcon: true,
    }) as ColumnDef<Product> & { key: ProductTableColumnKey },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Link
          href={ADMIN_ROUTES.products.detail(row.productId)}
          onClick={(e) => e.stopPropagation()}
          className="border-border-default bg-bg-surface text-ink-tertiary hover:bg-bg-muted hover:text-ink-primary flex size-7 items-center justify-center rounded-[var(--r-sm)] border transition-colors"
          aria-label="Xem chi tiết"
        >
          <Eye className="size-3.5" />
        </Link>
      ),
    },
  ];

  const renderToolbar = () => {
    const pageConfig = productConfig;
    const hasStatusFilter = !pageConfig.statuses.includes("all");
    const hasGlobalSearch = Boolean(pageConfig.globalSearch.query.trim());
    const visibleColumnCount = pageConfig.visibleColumns.filter(
      (column) => column !== "actions",
    ).length;
    const hasColumnConfig = visibleColumnCount !== PRODUCT_DEFAULT_COLUMNS.length - 1;
    const hasAnyConfig =
      hasStatusFilter || hasGlobalSearch || pageConfig.showStats || hasColumnConfig;
    const summaryItems: ListSummaryItem[] = [
      { label: "Stats", value: pageConfig.showStats ? "Đang hiện" : "Đang ẩn" },
      {
        label: "Trạng thái",
        value: pageConfig.statuses
          .map(
            (status) =>
              PRODUCT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
          )
          .join(", "),
        active: hasStatusFilter,
        onClear: () => productFilters.setStatus([]),
      },
      {
        label: "Search chính",
        value: hasGlobalSearch ? `“${pageConfig.globalSearch.query}”` : "Chưa dùng",
        active: hasGlobalSearch,
        onClear: () => productFilters.setQ(""),
      },
      {
        label: "Cột hiển thị",
        value: `${visibleColumnCount}/${PRODUCT_DEFAULT_COLUMNS.length - 1}`,
        active: hasColumnConfig,
        onClear: () =>
          updateProductsConfig((current) => ({
            ...current,
            visibleColumns: PRODUCT_DEFAULT_COLUMNS,
          })),
      },
    ];
    return (
      <ListToolbar
        search={pageConfig.globalSearch.query}
        onSearchChange={productFilters.setQ}
        searchPlaceholder="Tìm sản phẩm theo mã hoặc tên..."
        statusOptions={PRODUCT_STATUS_OPTIONS}
        selectedStatuses={pageConfig.statuses}
        onToggleStatus={toggleProductStatus}
        onClearStatuses={() => productFilters.setStatus([])}
        hasStatusFilter={hasStatusFilter}
        columnOptions={PRODUCT_DEFAULT_COLUMNS.map((column) => ({
          label: PRODUCT_COLUMN_LABELS[column],
          value: column,
        }))}
        selectedColumns={pageConfig.visibleColumns}
        defaultColumns={PRODUCT_DEFAULT_COLUMNS}
        lockedColumns={["actions"]}
        visibleColumnCount={visibleColumnCount}
        onToggleColumn={(column) =>
          column !== "actions" &&
          updateProductsConfig((current) => ({
            ...current,
            visibleColumns: current.visibleColumns.includes(column)
              ? current.visibleColumns.filter((item) => item !== column)
              : [...current.visibleColumns, column],
          }))
        }
        onResetColumns={() =>
          updateProductsConfig((current) => ({
            ...current,
            visibleColumns: PRODUCT_DEFAULT_COLUMNS,
          }))
        }
        hasColumnConfig={hasColumnConfig}
        selectedCount={prodSelectedKeys.size}
        onBulkDelete={() => {
          toast.info(
            "Xoá sản phẩm",
            `Đã chọn ${prodSelectedKeys.size} sản phẩm. Chức năng này đang ở UI-only.`,
          );
          setProdSelectedKeys(new Set());
        }}
        onExport={() =>
          toast.success(
            "Xuất file mock",
            `Sẵn sàng xuất ${rawProducts.length} sản phẩm trên trang hiện tại.`,
          )
        }
        summaryItems={summaryItems}
        onResetAll={() => {
          updateProductsConfig(() => DEFAULT_CONFIG.products);
          productFilters.reset();
        }}
        resetDisabled={!hasAnyConfig}
      />
    );
  };

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Sản phẩm" subtitle={PAGE_SUBTITLE} />
        <EmptyState
          icon={<XCircle className="size-8" />}
          title="Không tải được dữ liệu sản phẩm"
          description="Load error khác với danh sách trống. Hãy thử tải lại hoặc kiểm tra kết nối API."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void productsQuery.refetch();
                void categoriesQuery.refetch();
              }}
              className="rounded-[var(--r-sm)]"
            >
              Thử lại
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sản phẩm"
        subtitle={PAGE_SUBTITLE}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={productConfig.showStats ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateProductsConfig((current) => ({ ...current, showStats: !current.showStats }))
              }
              className={cn(
                "rounded-[var(--r-sm)]",
                productConfig.showStats &&
                  "border-brand bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand border",
              )}
            >
              <BarChart3 className="size-3.5" />
              {productConfig.showStats ? "Ẩn thống kê" : "Hiện thống kê"}
            </Button>
            <Button
              variant="default"
              type="button"
              size="sm"
              onClick={() => canCreateProduct && router.push(ADMIN_ROUTES.products.create)}
              disabled={!canCreateProduct}
              title={canCreateProduct ? "Tạo sản phẩm" : PERMISSION_UI.productCreateDenied}
              className="bg-brand !text-ink-inverse hover:bg-brand-hover hover:!text-ink-inverse rounded-[var(--r-sm)]"
            >
              <Plus className="size-3.5" />
              Tạo sản phẩm
            </Button>
          </div>
        }
      />

      <ListStatsPanel
        stats={productStats}
        open={productConfig.showStats}
        gridClassName="sm:grid-cols-1"
      />
      {renderToolbar()}
      {productEmptyState === "none" ? (
        <DataTable
          data={rawProducts}
          columns={productColumns.filter((column) =>
            productConfig.visibleColumns.includes(column.key),
          )}
          rowKey={(row) => row.productId}
          caption={`Hiển thị ${rawProducts.length} sản phẩm`}
          flagRow={shouldFlagProductRow}
          onRowClick={navigateToDetail}
          selectable
          selectedKeys={prodSelectedKeys}
          onSelectionChange={setProdSelectedKeys}
          pageSize={productPageSize}
          serverPagination={{
            page: productPage?.page ?? toProductApiPage(productFilters.page),
            size: productPage?.size ?? productPageSize,
            totalElements: productPage?.totalElements ?? 0,
            totalPages: productPage?.totalPages ?? 0,
            hasNext: productPage?.hasNext ?? false,
            hasPrevious: productPage?.hasPrevious ?? false,
            onPageChange: (page) => void productFilters.setPage(toProductUiPage(page)),
            onPageSizeChange: (pageSize) => {
              setProductPageSize(pageSize);
              void productFilters.setPage(1);
            },
          }}
          serverSorting={{
            key: productSort.key === "code" ? "productId" : productSort.key,
            direction: productSort.direction,
            onChange: (key, direction) => {
              const backendKey = key === "productId" ? "code" : key;
              if (backendKey === "code" || backendKey === "name" || backendKey === "status") {
                setProductSort({ key: backendKey, direction });
                void productFilters.setPage(1);
              }
            },
          }}
        />
      ) : productEmptyState === "no-products" ? (
        <EmptyState
          icon={<Package className="size-8" />}
          title="Chưa có sản phẩm"
          description="Môi trường hiện tại chưa có Product record nào. Đây là trạng thái dữ liệu trống, không phải lỗi tải."
          action={
            canCreateProduct ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => router.push(ADMIN_ROUTES.products.create)}
                className="bg-brand !text-ink-inverse hover:bg-brand-hover hover:!text-ink-inverse rounded-[var(--r-sm)]"
              >
                <Plus className="size-3.5" />
                Tạo sản phẩm đầu tiên
              </Button>
            ) : undefined
          }
        />
      ) : productEmptyState === "no-results" ? (
        <EmptyState
          icon={<Package className="size-8" />}
          title="Không tìm thấy kết quả"
          description="Có dữ liệu sản phẩm, nhưng bộ lọc hoặc từ khoá hiện tại không khớp bản ghi nào."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                updateProductsConfig(() => DEFAULT_CONFIG.products);
                productFilters.reset();
              }}
              className="rounded-[var(--r-sm)]"
            >
              Bỏ bộ lọc
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<Package className="size-8" />}
          title="Trang không còn dữ liệu"
          description="Trang hiện tại nằm ngoài phạm vi kết quả. Hệ thống sẽ quay về trang hợp lệ gần nhất."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void productFilters.setPage(1)}
              className="rounded-[var(--r-sm)]"
            >
              Về trang đầu
            </Button>
          }
        />
      )}
    </>
  );
}
