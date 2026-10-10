/**
 * Mock routes — register all mock API handlers.
 *
 * Each handler reads from mock-data.ts and returns paginated/filtered results.
 * Called once by activateMockAdapter() → registerAllMockRoutes().
 *
 * **Only this file + mock-adapter.ts may import mock-data.ts.**
 */

import { registerMockRoute, paginate } from "./mock-adapter";

import type { Product } from "@/lib/mock-data";

/** BE PR #71 `CreateProductRequest` / `UpdateProductRequest` (+ `reason` của rejection). */
interface CreateProductMockBody {
  productId?: unknown;
  code?: unknown;
  name?: unknown;
  nameEn?: unknown;
  brandId?: unknown;
  categoryId?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  descriptionEn?: unknown;
  taxClass?: unknown;
  kind?: unknown;
  reason?: unknown;
}

type MockProduct = Product & {
  brandId?: string | null;
  shortDescription?: string;
};

const createdProducts: MockProduct[] = [];
const productOverrides = new Map<string, MockProduct>();

/** BE PR #71 `BrandResponse` — thương hiệu của seed mock (theo tên `brand` trong mock-data). */
const MOCK_BRANDS = [
  { brandId: "BRD-SFB", code: "SFB", name: "StockFlow Basics", slug: "stockflow-basics" },
  { brandId: "BRD-GILDAN", code: "GILDAN", name: "Gildan", slug: "gildan" },
].map((brand) => ({ ...brand, logoUrl: null, active: true, version: 0 }));

/** Seed mock chỉ có tên thương hiệu; BE PR #71 trả kèm `brandId`. */
function withBrandId(product: MockProduct): MockProduct {
  if (product.brandId) return product;
  return {
    ...product,
    brandId: MOCK_BRANDS.find((b) => b.name === product.brand)?.brandId ?? null,
  };
}

function mockPage<T>(items: T[]) {
  return {
    items,
    page: 0,
    size: Math.max(items.length, 1),
    totalElements: items.length,
    totalPages: items.length ? 1 : 0,
    hasNext: false,
    hasPrevious: false,
  };
}

function validationFailed(fieldErrors: Record<string, string>) {
  return {
    status: 422,
    data: {
      errorCode: "VALIDATION_FAILED",
      message: "Dữ liệu sản phẩm chưa hợp lệ.",
      fieldErrors: Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message,
        code: "NotBlank",
      })),
    },
    headers: {},
  };
}

const brandNotFound = () => ({
  status: 404,
  data: {
    errorCode: "BRAND_NOT_FOUND",
    message: "Thương hiệu đã chọn không tồn tại.",
    fieldErrors: [{ field: "brandId", message: "Thương hiệu không còn khả dụng.", code: "Exists" }],
  },
  headers: {},
});
const MOCK_SUBMITTER_ID = "11111111-1111-4111-8111-111111111111";
const MOCK_APPROVER_ID = "22222222-2222-4222-8222-222222222222";

export function registerAllMockRoutes(): void {
  /* ====================================================================
   * Module 01 — Products / SKUs / Categories / Suppliers
   * ==================================================================*/

  // GET /products
  registerMockRoute("GET", "/products", async (config) => {
    const { products } = await import("@/lib/mock-data");
    const params = readRequestSearchParams(config);
    const page = Math.max(0, Number(params.get("page")) || 0);
    const pageSize = Math.max(1, Number(params.get("size")) || 15);
    const q = params.get("q")?.trim().toLowerCase();
    const statuses = params
      .getAll("status")
      .map(readProductStatus)
      .filter((status): status is Product["status"] => status !== null);
    const [sortField = "code", sortDirection = "asc"] = (params.get("sort") ?? "code,asc").split(
      ",",
    );

    let filtered = [...products, ...createdProducts].map((product) =>
      withBrandId(productOverrides.get(product.productId) ?? product),
    );
    if (q)
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.productId.toLowerCase().includes(q),
      );
    if (statuses.length) filtered = filtered.filter((p) => statuses.includes(p.status));
    if (sortField === "code" || sortField === "name" || sortField === "status") {
      filtered.sort((left, right) => {
        const leftValue = sortField === "code" ? left.productId : left[sortField];
        const rightValue = sortField === "code" ? right.productId : right[sortField];
        return sortDirection === "desc"
          ? rightValue.localeCompare(leftValue)
          : leftValue.localeCompare(rightValue);
      });
    }

    const totalElements = filtered.length;
    const totalPages = Math.ceil(totalElements / pageSize);
    const start = page * pageSize;
    return {
      status: 200,
      data: {
        items: filtered.slice(start, start + pageSize),
        page,
        size: pageSize,
        totalElements,
        totalPages,
        hasNext: page + 1 < totalPages,
        hasPrevious: page > 0,
      },
      headers: {},
    };
  });

  // GET /products/:id
  registerMockRoute("GET", "/products/:id", async (config) => {
    const { products } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const product =
      productOverrides.get(id) ?? [...products, ...createdProducts].find((p) => p.productId === id);
    if (!product) return { status: 404, data: { message: "Product not found" }, headers: {} };
    return { status: 200, data: withBrandId(product), headers: {} };
  });

  // POST /products
  registerMockRoute("POST", "/products", async (config) => {
    const { categories, products } = await import("@/lib/mock-data");
    const body = parseCreateProductBody(config.data);
    const productId = readString(body.code) || readString(body.productId);
    const fieldErrors: Record<string, string> = {};

    if (!productId) fieldErrors.productId = "Nhập mã sản phẩm";
    if (!readString(body.name)) fieldErrors.name = "Nhập tên sản phẩm";
    if (!readString(body.nameEn)) fieldErrors.nameEn = "Nhập tên tiếng Anh";
    if (!readString(body.categoryId)) fieldErrors.categoryId = "Chọn danh mục";
    if (Object.keys(fieldErrors).length > 0) return validationFailed(fieldErrors);
    const brand = MOCK_BRANDS.find((b) => b.brandId === readString(body.brandId));
    if (readString(body.brandId) && !brand) return brandNotFound();

    const duplicated = [...products, ...createdProducts].some(
      (product) => product.productId === productId,
    );
    if (duplicated) {
      return {
        status: 409,
        data: {
          errorCode: "PRODUCT_CODE_ALREADY_EXISTS",
          message: "Mã sản phẩm đã tồn tại.",
          fieldErrors: [{ field: "code", message: "Mã sản phẩm đã tồn tại.", code: "Unique" }],
        },
        headers: {},
      };
    }

    const categoryId = readString(body.categoryId);
    const categoryExists = categories.some((category) => category.categoryId === categoryId);
    if (!categoryExists) {
      return {
        status: 404,
        data: {
          errorCode: "CATEGORY_NOT_FOUND",
          message: "Danh mục đã chọn không tồn tại.",
          fieldErrors: [
            {
              field: "categoryId",
              message: "Danh mục đã bị xoá hoặc không còn khả dụng.",
              code: "Exists",
            },
          ],
        },
        headers: {},
      };
    }

    const now = new Date().toISOString();
    const product: MockProduct = {
      productId,
      name: readString(body.name),
      nameEn: readString(body.nameEn) || readString(body.name),
      slug: slugify(readString(body.name) || productId),
      // BE PR #71: `kind` thay `customizable`; ảnh theo biến thể, logistics theo SKU.
      type: body.kind === "CUSTOMIZABLE" ? "Customizable" : "Standard",
      categoryId,
      status: "Draft",
      shortDescription: readString(body.shortDescription) || undefined,
      description: readString(body.description),
      descriptionEn: readString(body.descriptionEn),
      images: [],
      basePrice: 0,
      attributes: [],
      taxClass: readTaxClass(
        typeof body.taxClass === "string" ? body.taxClass.toLowerCase() : body.taxClass,
      ),
      uom: "pcs",
      brand: brand?.name ?? "",
      brandId: brand?.brandId ?? null,
      createdAt: now,
      createdBy: "Mock API",
    };

    createdProducts.push(product);
    return { status: 201, data: product, headers: {} };
  });

  registerMockRoute("PUT", "/products/:id", async (config) => {
    const { products } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const current =
      productOverrides.get(id) ?? [...products, ...createdProducts].find((p) => p.productId === id);
    if (!current)
      return {
        status: 404,
        data: { errorCode: "PRODUCT_NOT_FOUND", message: "Product not found" },
        headers: {},
      };
    const body = parseCreateProductBody(config.data);
    const brand = MOCK_BRANDS.find((b) => b.brandId === readString(body.brandId));
    if (readString(body.brandId) && !brand) return brandNotFound();
    const updated: MockProduct = {
      ...current,
      name: readString(body.name),
      nameEn: readString(body.nameEn),
      categoryId: readString(body.categoryId),
      shortDescription: readString(body.shortDescription) || undefined,
      description: readString(body.description),
      descriptionEn: readString(body.descriptionEn),
      brand: brand?.name ?? "",
      brandId: brand?.brandId ?? null,
      type: body.kind === "CUSTOMIZABLE" ? "Customizable" : "Standard",
      taxClass: readTaxClass(
        typeof body.taxClass === "string" ? body.taxClass.toLowerCase() : body.taxClass,
      ),
    };
    productOverrides.set(id, updated);
    return { status: 200, data: updated, headers: {} };
  });

  registerProductTransitionRoutes();

  // GET /categories — BE PR #71 PageResponse<CategoryResponse>
  registerMockRoute("GET", "/categories", async () => {
    const { categories } = await import("@/lib/mock-data");
    const pathOf = (id: string | null): string => {
      const node = categories.find((c) => c.categoryId === id);
      return node ? `${pathOf(node.parentId)}/${node.categoryId}` : "";
    };
    const rows = categories.map((c, i) => ({
      categoryId: c.categoryId,
      parentId: c.parentId,
      code: c.categoryId,
      name: c.name.vi,
      slug: c.slug,
      path: pathOf(c.categoryId),
      depth: c.level - 1,
      sortOrder: i,
      imageUrl: null,
      seoTitle: null,
      seoDescription: null,
      active: true,
      version: 0,
    }));
    rows.sort((a, b) => a.path.localeCompare(b.path));
    return { status: 200, data: mockPage(rows), headers: {} };
  });

  // GET /brands — BE PR #71 PageResponse<BrandResponse>
  registerMockRoute("GET", "/brands", async () => ({
    status: 200,
    data: mockPage([...MOCK_BRANDS].sort((a, b) => a.name.localeCompare(b.name))),
    headers: {},
  }));

  // Suppliers: xem mock-routes-suppliers.ts (đăng ký trong mock-adapter.ts)

  /* ====================================================================
   * Module 02 — Purchase Orders / Replenishment
   * ==================================================================*/

  // Purchase orders: mock-routes-purchase-orders.ts (BE PurchaseOrderController contract).

  // FE-only: BE has no GET /api/v1/replenishment-proposals yet.
  // GET /replenishment-proposals
  registerMockRoute("GET", "/replenishment-proposals", async (config) => {
    const { replenishmentProposals } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;

    return { status: 200, data: paginate(replenishmentProposals, page, pageSize), headers: {} };
  });

  /* ====================================================================
   * Module 04 — Invoices
   * ==================================================================*/

  registerMockRoute("GET", "/invoices", async (config) => {
    const { invoices } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...invoices];
    if (status.length) filtered = filtered.filter((i) => status.includes(i.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/invoices/:id", async (config) => {
    const { invoices } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const invoice = invoices.find((i) => i.invoiceId === id);
    if (!invoice) return { status: 404, data: { message: "Invoice not found" }, headers: {} };
    return { status: 200, data: invoice, headers: {} };
  });

  /* ====================================================================
   * Module 05 — Putaway Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/putaway-tasks", async (config) => {
    const { putawayTasks } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...putawayTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/putaway-tasks/:id", async (config) => {
    const { putawayTasks } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = putawayTasks.find((t) => t.taskId === id);
    if (!task) return { status: 404, data: { message: "Putaway task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 06 — Warehouses / Zones / Locations / Slotting
   * ==================================================================*/

  registerMockRoute("GET", "/warehouses", async () => {
    const { warehouses } = await import("@/lib/mock-data");
    return { status: 200, data: { items: warehouses, total: warehouses.length }, headers: {} };
  });

  registerMockRoute("GET", "/warehouses/:id", async (config) => {
    const { warehouses } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const wh = warehouses.find((w) => w.warehouseId === id);
    if (!wh) return { status: 404, data: { message: "Warehouse not found" }, headers: {} };
    return { status: 200, data: wh, headers: {} };
  });

  registerMockRoute("GET", "/zones", async () => {
    const { zones } = await import("@/lib/mock-data");
    return { status: 200, data: { items: zones, total: zones.length }, headers: {} };
  });

  registerMockRoute("GET", "/locations", async (config) => {
    const { locations } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 50;

    return { status: 200, data: paginate(locations, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/slotting-suggestions", async () => {
    const { slottingSuggestions } = await import("@/lib/mock-data");
    return {
      status: 200,
      data: { items: slottingSuggestions, total: slottingSuggestions.length },
      headers: {},
    };
  });

  registerMockRoute("GET", "/warehouse-kpis", async () => {
    const { warehouseKpis } = await import("@/lib/mock-data");
    return {
      status: 200,
      data: { items: warehouseKpis, total: warehouseKpis.length },
      headers: {},
    };
  });

  /* ====================================================================
   * Module 07 — Pick Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/pick-tasks", async (config) => {
    const { pickTasks } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...pickTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/pick-tasks/:id", async (config) => {
    const { pickTasks } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = pickTasks.find((t) => t.pickId === id);
    if (!task) return { status: 404, data: { message: "Pick task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 08 — Packing Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/packing-tasks", async (config) => {
    const { packingTasks } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...packingTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/packing-tasks/:id", async (config) => {
    const { packingTasks } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = packingTasks.find((t) => t.taskId === id);
    if (!task) return { status: 404, data: { message: "Packing task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 09 — Shipments / Carriers
   * ==================================================================*/

  registerMockRoute("GET", "/shipments", async (config) => {
    const { shipments } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...shipments];
    if (status.length) filtered = filtered.filter((s) => status.includes(s.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/shipments/:id", async (config) => {
    const { shipments } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const shipment = shipments.find((s) => s.shipmentId === id);
    if (!shipment) return { status: 404, data: { message: "Shipment not found" }, headers: {} };
    return { status: 200, data: shipment, headers: {} };
  });

  registerMockRoute("GET", "/carriers", async () => {
    const { carriers } = await import("@/lib/mock-data");
    return { status: 200, data: { items: carriers, total: carriers.length }, headers: {} };
  });

  /* ====================================================================
   * Module 10 — Transfer Orders
   * ==================================================================*/

  registerMockRoute("GET", "/transfer-orders", async (config) => {
    const { transferOrders } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...transferOrders];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/transfer-orders/:id", async (config) => {
    const { transferOrders } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const transfer = transferOrders.find((t) => t.transferOrderId === id);
    if (!transfer) return { status: 404, data: { message: "Transfer not found" }, headers: {} };
    return { status: 200, data: transfer, headers: {} };
  });

  /* ====================================================================
   * Module 11 — Move Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/move-tasks", async (config) => {
    const { moveTasks } = await import("@/lib/mock-data");
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...moveTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/move-tasks/:id", async (config) => {
    const { moveTasks } = await import("@/lib/mock-data");
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = moveTasks.find((t) => t.moveTaskId === id);
    if (!task) return { status: 404, data: { message: "Move task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Staff Users (for admin user management)
   * ==================================================================*/

  registerMockRoute("GET", "/staff-users", async () => {
    const { staffUsers } = await import("@/lib/mock-data");
    return { status: 200, data: { items: staffUsers, total: staffUsers.length }, headers: {} };
  });
}

function registerProductTransitionRoutes(): void {
  registerProductTransition("submission", ["Draft"], "Pending Approval", (product) => ({
    ...product,
    submittedBy: MOCK_SUBMITTER_ID,
    submittedAt: new Date().toISOString(),
  }));
  registerProductTransition("approval", ["Pending Approval"], "Approved", (product) => ({
    ...product,
    approvedBy: MOCK_APPROVER_ID,
    approvedAt: new Date().toISOString(),
  }));
  registerProductTransition("discontinuation", ["Approved", "Published"], "Discontinued");
  registerProductTransition("unpublication", ["Published"], "Approved", undefined, true);
  registerProductTransition("publication", ["Approved"], "Published", undefined, true);

  registerMockRoute("POST", "/products/:id/rejection", async (config) => {
    const body = parseCreateProductBody(config.data);
    if (!readString(body.reason)) {
      return mockValidationError("reason", "Lý do từ chối là bắt buộc.");
    }
    return transitionMockProduct(config, ["Pending Approval"], "Draft", (product) => ({
      ...product,
      submittedBy: undefined,
      submittedAt: undefined,
    }));
  });
}

function registerProductTransition(
  suffix: string,
  fromStatuses: Product["status"][],
  targetStatus: Product["status"],
  enrich?: (product: MockProduct) => MockProduct,
  voidResponse = false,
): void {
  registerMockRoute("POST", `/products/:id/${suffix}`, (config) =>
    transitionMockProduct(config, fromStatuses, targetStatus, enrich, voidResponse),
  );
}

async function transitionMockProduct(
  config: import("axios").AxiosRequestConfig,
  fromStatuses: Product["status"][],
  targetStatus: Product["status"],
  enrich?: (product: MockProduct) => MockProduct,
  voidResponse = false,
) {
  const { products } = await import("@/lib/mock-data");
  const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
  const current =
    productOverrides.get(id) ??
    [...products, ...createdProducts].find((item) => item.productId === id);
  if (!current) {
    return {
      status: 404,
      data: { errorCode: "PRODUCT_NOT_FOUND", message: "Product not found" },
      headers: {},
    };
  }
  if (!fromStatuses.includes(current.status)) {
    return {
      status: 409,
      data: {
        errorCode: "INVALID_PRODUCT_STATUS_TRANSITION",
        message: "This product cannot move to that status right now",
      },
      headers: {},
    };
  }
  const transitioned = enrich?.({ ...current, status: targetStatus }) ?? {
    ...current,
    status: targetStatus,
  };
  productOverrides.set(id, transitioned);
  return { status: 200, data: voidResponse ? null : transitioned, headers: {} };
}

function mockValidationError(field: string, message: string) {
  return {
    status: 400,
    data: {
      errorCode: "VALIDATION_FAILED",
      message: "Dữ liệu không hợp lệ.",
      fieldErrors: [{ field, message, code: "NotBlank" }],
    },
    headers: {},
  };
}

function parseCreateProductBody(data: unknown): CreateProductMockBody {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(data) ? data : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRequestSearchParams(config: { url?: string; params?: unknown }): URLSearchParams {
  if (config.params instanceof URLSearchParams) return new URLSearchParams(config.params);
  return new URLSearchParams(config.url?.split("?")[1] ?? "");
}

function readProductStatus(value: string): Product["status"] | null {
  switch (value) {
    case "DRAFT":
      return "Draft";
    case "PENDING_APPROVAL":
      return "Pending Approval";
    case "APPROVED":
      return "Approved";
    case "PUBLISHED":
      return "Published";
    case "DISCONTINUED":
      return "Discontinued";
    default:
      return null;
  }
}

function readTaxClass(value: unknown): Product["taxClass"] {
  return value === "reduced" || value === "exempt" ? value : "standard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
