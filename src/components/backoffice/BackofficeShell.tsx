"use client";

import { cn } from "cn";
import {
  ArrowRightLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MapPin,
  Moon,
  Move,
  Package,
  PackageCheck,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShieldCheck,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  User,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ADMIN_ROUTES,
  APP_ROUTES,
  BRAND,
  GOODS_RECEIPT_PERMISSIONS,
  IDENTITY_PERMISSIONS,
  ORDER_PERMISSIONS,
  PO_PERMISSIONS,
  SUPPLIER_PERMISSIONS,
} from "@/constants";

import { logoutApi } from "@/lib/auth/auth-api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { usePermissionChecker } from "@/lib/auth/components/Can";
import { useBreadcrumbLabelStore } from "@/lib/store/use-breadcrumb-labels";
import {
  invoices,
  moveTasks,
  packingTasks,
  pickTasks,
  purchaseOrders,
  putawayTasks,
  shipments,
  transferOrders,
  warehouses,
} from "@/lib/mock-data";

import { Logo } from "@/components/shared/Logo";
import { SearchBar } from "@/components/shared/SearchBar";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { LucideIcon } from "lucide-react";
import type { PermissionCode } from "@/lib/auth/me-permissions";
import type { Warehouse } from "@/lib/mock-data";
/* -------------------------------------------------------------------------- */
/*  Warning dot counts — computed from mock data                             */
/* -------------------------------------------------------------------------- */

const WARNING_STATUSES: Record<string, string[]> = {
  "/admin/purchase-orders": ["Pending Approval"],
  "/admin/invoices": ["Exception", "Disputed"],
  "/admin/putaway": ["On Hold"],
  "/admin/picking": ["Short", "On Hold"],
  "/admin/packing": ["Verification Failed", "On Hold"],
  "/admin/shipments": ["Exception", "Delivery Failed"],
  "/admin/transfers": ["Partially Received"],
  "/admin/moves": ["On Hold", "Discrepancy"],
};

function computeWarningCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  counts["/admin/purchase-orders"] = purchaseOrders.filter((po) =>
    WARNING_STATUSES["/admin/purchase-orders"]!.includes(po.status),
  ).length;
  counts["/admin/invoices"] = invoices.filter((inv) =>
    WARNING_STATUSES["/admin/invoices"]!.includes(inv.status),
  ).length;
  counts["/admin/putaway"] = putawayTasks.filter((pt) =>
    WARNING_STATUSES["/admin/putaway"]!.includes(pt.status),
  ).length;
  counts["/admin/picking"] = pickTasks.filter((pk) =>
    WARNING_STATUSES["/admin/picking"]!.includes(pk.status),
  ).length;
  counts["/admin/packing"] = packingTasks.filter((pa) =>
    WARNING_STATUSES["/admin/packing"]!.includes(pa.status),
  ).length;
  counts["/admin/shipments"] = shipments.filter((sh) =>
    WARNING_STATUSES["/admin/shipments"]!.includes(sh.status),
  ).length;
  counts["/admin/transfers"] = transferOrders.filter((to) =>
    WARNING_STATUSES["/admin/transfers"]!.includes(to.status),
  ).length;
  counts["/admin/moves"] = moveTasks.filter((mv) =>
    WARNING_STATUSES["/admin/moves"]!.includes(mv.status),
  ).length;
  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Sidebar nav config                                                       */
/* -------------------------------------------------------------------------- */

interface NavItem {
  label: string;
  tooltip: string;
  href: string;
  icon: LucideIcon;
  /** Mã quyền BE cần có để thấy menu (đọc từ /identity/me/permissions). Không khai báo = luôn hiện. */
  permission?: PermissionCode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "TỔNG QUAN",
    items: [{ label: "Tổng quan", tooltip: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    title: "MASTER DATA",
    items: [
      {
        label: "Sản phẩm & SKU",
        tooltip: "Products & SKUs",
        href: "/admin/products",
        icon: Package,
      },
      {
        label: "Thuộc tính biến thể",
        tooltip: "Variant Attributes",
        href: "/admin/variants",
        icon: Palette,
      },
      {
        label: "Nhà cung cấp",
        tooltip: "Suppliers",
        href: "/admin/suppliers",
        icon: Users,
        permission: SUPPLIER_PERMISSIONS.viewPage,
      },
    ],
  },
  {
    title: "PLATFORM",
    items: [
      {
        label: "Phân quyền",
        tooltip: "Permission management",
        href: ADMIN_ROUTES.permissions,
        icon: ShieldCheck,
        permission: IDENTITY_PERMISSIONS.rbacRead,
      },
    ],
  },
  {
    title: "MUA HÀNG",
    items: [
      {
        label: "Đề xuất nhập hàng",
        tooltip: "Replenishment",
        href: "/admin/replenishment",
        icon: Lightbulb,
      },
      {
        label: "Đơn đặt NCC",
        tooltip: "Purchase Orders",
        href: "/admin/purchase-orders",
        icon: ShoppingCart,
        permission: PO_PERMISSIONS.viewPage,
      },
      {
        label: "Hoá đơn NCC",
        tooltip: "Supplier Invoices",
        href: "/admin/invoices",
        icon: Receipt,
      },
    ],
  },
  {
    title: "NHẬP HÀNG",
    items: [
      {
        label: "Phiếu nhận",
        tooltip: "Goods receipts",
        href: ADMIN_ROUTES.receipts.list,
        icon: FileText,
        permission: GOODS_RECEIPT_PERMISSIONS.viewPage,
      },
      { label: "Cất hàng", tooltip: "Putaway", href: "/admin/putaway", icon: PackageCheck },
    ],
  },
  {
    title: "KHO",
    items: [
      {
        label: "Kho map & slotting",
        tooltip: "Warehouse Map",
        href: "/admin/warehouse-map",
        icon: MapPin,
      },
      {
        label: "Gợi ý vị trí",
        tooltip: "Slotting Suggestions",
        href: "/admin/slotting",
        icon: Lightbulb,
      },
      {
        label: "Chuyển kho liên kho",
        tooltip: "Inter-warehouse Transfers",
        href: "/admin/transfers",
        icon: ArrowRightLeft,
      },
      {
        label: "Di chuyển nội bộ",
        tooltip: "Intra-warehouse Moves",
        href: "/admin/moves",
        icon: Move,
      },
    ],
  },
  {
    title: "THỰC HIỆN ĐƠN",
    items: [
      {
        label: "Đơn hàng",
        tooltip: "Orders",
        href: ADMIN_ROUTES.orders.list,
        icon: ClipboardList,
        permission: ORDER_PERMISSIONS.viewPage,
      },
      { label: "Lấy hàng", tooltip: "Picking", href: "/admin/picking", icon: WarehouseIcon },
      { label: "Đóng gói", tooltip: "Packing", href: "/admin/packing", icon: PackageCheck },
      { label: "Vận đơn", tooltip: "Shipments", href: "/admin/shipments", icon: Truck },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Breadcrumb helper                                                        */
/* -------------------------------------------------------------------------- */

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const EDIT_SEGMENT = "edit";
const EDIT_LABEL = "Chỉnh sửa";

const DETAIL_LABEL_BY_ROUTE: Record<string, string> = {
  "/admin/products/create": "Tạo sản phẩm",
  "/admin/purchase-orders/create": "Tạo đơn đặt hàng",
  "/admin/suppliers/create": "Tạo nhà cung cấp",
};

/** Required capabilities fail closed; unassigned items remain visible. */
export function useCanSeeNavItem(): (item: NavItem) => boolean {
  const can = usePermissionChecker();
  return (item) => !item.permission || can(item.permission);
}

function findNavItem(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function buildBreadcrumbItems(
  pathname: string,
  canSeeItem: (item: NavItem) => boolean = () => true,
  /** Nhãn thay cho id trong URL (vd UUID → mã NCC). Không có → hiện id. */
  labelFor: (id: string) => string | undefined = () => undefined,
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "Back-office", href: ADMIN_ROUTES.home }];
  if (pathname === ADMIN_ROUTES.home) return items;

  const navItem = findNavItem(pathname);
  if (!navItem) return items;

  const isListPage = pathname === navItem.href;
  // Thiếu quyền vào menu này → chỉ hiện chữ, không dẫn tới trang sẽ bị chặn
  const linkable = canSeeItem(navItem);
  items.push({ label: navItem.label, href: isListPage || !linkable ? undefined : navItem.href });

  if (!isListPage) {
    const rest = pathname
      .slice(navItem.href.length + 1)
      .split("/")
      .filter(Boolean);
    // `/<module>/<id>/edit` → "… / <id> / Chỉnh sửa" thay vì chữ "edit"
    if (rest.length >= 2 && rest.at(-1) === EDIT_SEGMENT) {
      const id = rest.slice(0, -1).join("/");
      items.push({
        label: labelFor(id) ?? decodeURIComponent(id),
        href: linkable ? `${navItem.href}/${id}` : undefined,
      });
      items.push({ label: EDIT_LABEL });
    } else {
      const last = pathname.split("/").at(-1) ?? "";
      items.push({
        label:
          DETAIL_LABEL_BY_ROUTE[pathname] ??
          labelFor(last) ??
          (last ? decodeURIComponent(last) : "Chi tiết"),
      });
    }
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/*  Sidebar nội dung — dùng shadcn primitives, giữ nguyên style StockFlow     */
/* -------------------------------------------------------------------------- */

function SidebarCollapseButton() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const label = collapsed ? "Mở rộng sidebar" : "Thu nhỏ sidebar";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleSidebar}
      className="text-ink-tertiary hover:bg-bg-muted hover:text-ink-primary hidden size-7 shrink-0 rounded-[var(--r-sm)] bg-transparent md:flex"
      aria-label={label}
      title={label}
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </Button>
  );
}

interface WarehouseSwitcherProps {
  selected: string;
  onSelect: (warehouseId: string) => void;
  label: string;
}

/** Đổi kho — nằm ở header sidebar, cạnh logo. Thu gọn thì chỉ còn icon + tooltip.
 *  TODO: state nên chuyển sang useAppStore.warehouseId (đã có persist) để F5 không mất
 *  lựa chọn kho — xem .claude/rules/state-persistence.md. Ngoài phạm vi task này. */
function WarehouseSwitcher({ selected, onSelect, label }: WarehouseSwitcherProps) {
  const [open, setOpen] = useState(false);
  const title = `Kho đang xem: ${label}`;

  return (
    <div className="relative shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((o) => !o)}
            className="text-ink-tertiary hover:bg-bg-muted hover:text-ink-primary size-7 shrink-0 rounded-[var(--r-sm)] bg-transparent transition-colors duration-150"
            aria-label={title}
            aria-expanded={open}
          >
            <WarehouseIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{title}</TooltipContent>
      </Tooltip>

      {open && (
        <>
          <div className="fixed inset-0 z-[800]" onClick={() => setOpen(false)} />
          <div className="border-border-default bg-bg-surface absolute top-full right-0 z-[801] mt-1 w-64 rounded-[var(--r-md)] border py-1 shadow-[var(--sh-lg)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onSelect("all");
                setOpen(false);
              }}
              className={cn(
                "hover:bg-bg-muted h-auto w-full justify-start gap-2 rounded-none bg-transparent px-3 py-1.5 text-left text-[0.8125rem] transition-colors",
                selected === "all" ? "text-accent font-medium" : "text-ink-secondary",
              )}
            >
              Tất cả kho
            </Button>
            {warehouses.map((wh: Warehouse) => (
              <Button
                key={wh.warehouseId}
                type="button"
                variant="ghost"
                onClick={() => {
                  onSelect(wh.warehouseId);
                  setOpen(false);
                }}
                className={cn(
                  "hover:bg-bg-muted h-auto w-full justify-start gap-2 rounded-none bg-transparent px-3 py-1.5 text-left text-[0.8125rem] transition-colors",
                  selected === wh.warehouseId ? "text-accent font-medium" : "text-ink-secondary",
                )}
              >
                <span className="text-ink-tertiary font-[family-name:var(--font-mono)] text-xs">
                  {wh.code}
                </span>
                <span className="truncate">{wh.name}</span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BackofficeSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const warningCounts = useMemo(() => computeWarningCounts(), []);
  const canSeeItem = useCanSeeNavItem();

  return (
    <Sidebar
      collapsible="icon"
      className="border-border-default [&_[data-slot=sidebar-inner]]:bg-bg-subtle border-r"
    >
      <SidebarHeader
        className={cn(
          "border-border-default h-14 shrink-0 flex-row items-center border-b p-0",
          collapsed ? "justify-center px-0" : "gap-1 px-2",
        )}
      >
        <Link
          href={ADMIN_ROUTES.home}
          aria-label={`${BRAND.name} — về trang tổng quan`}
          className={cn(
            "hover:bg-bg-muted focus-visible:ring-border-strong flex min-w-0 items-center rounded-[var(--r-sm)] transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none",
            collapsed ? "size-10 justify-center" : "h-10 flex-1 gap-2 px-1.5",
          )}
        >
          {/* Logo đã có sẵn chữ "StockFlow" trong ảnh — không cần chữ HTML kèm theo. */}
          <Logo variant="mark" height={collapsed ? 32 : 36} decorative />
        </Link>

        {!collapsed && <SidebarCollapseButton />}
      </SidebarHeader>

      {collapsed && (
        <div className="border-border-default flex justify-center border-b py-1.5">
          <SidebarCollapseButton />
        </div>
      )}

      {/* Nav groups */}
      <SidebarContent className="[&::-webkit-scrollbar-thumb]:bg-border-strong min-h-0 flex-1 [scrollbar-width:thin] gap-0 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title} className="mb-1.5 gap-0 p-0">
            {collapsed ? (
              <div className="border-border-default mx-auto my-1.5 w-8 border-t" />
            ) : (
              <SidebarGroupLabel className="text-ink-tertiary h-auto px-2.5 pt-3 pb-0.5 text-[0.625rem] font-semibold tracking-[0.08em] uppercase">
                {group.title}
              </SidebarGroupLabel>
            )}

            <SidebarGroupContent>
              <SidebarMenu className={cn("gap-0.5", collapsed && "items-center")}>
                {group.items.filter(canSeeItem).map((item) => {
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  const warnCount = warningCounts[item.href] ?? 0;

                  return (
                    <SidebarMenuItem key={item.href} className={cn(collapsed && "w-8")}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.tooltip}
                        className={cn(
                          "h-auto rounded-[var(--r-sm)] transition-colors duration-150",
                          collapsed
                            ? "justify-center gap-0 group-data-[collapsible=icon]:overflow-visible"
                            : "gap-2.5 px-2.5 py-1.5 text-[0.8125rem]",
                          isActive
                            ? "bg-brand text-ink-inverse hover:bg-brand hover:text-ink-inverse data-active:bg-brand data-active:text-ink-inverse font-medium"
                            : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary",
                        )}
                      >
                        <Link href={item.href}>
                          <Icon className="size-4 shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      </SidebarMenuButton>

                      {/* Warning dot */}
                      {warnCount > 0 &&
                        (collapsed ? (
                          <span className="bg-positive ring-bg-subtle pointer-events-none absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[0.5625rem] leading-none font-bold text-white ring-2">
                            {warnCount}
                          </span>
                        ) : (
                          <SidebarMenuBadge className="bg-positive inset-y-0 my-auto size-[18px] min-w-0 justify-center rounded-full px-0 text-[0.5625rem] leading-none font-bold text-white peer-hover/menu-button:text-white peer-data-active/menu-button:text-white peer-data-[size=default]/menu-button:top-0">
                            {warnCount}
                          </SidebarMenuBadge>
                        ))}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                    */
/* -------------------------------------------------------------------------- */

export function BackofficeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const currentUser = useAuthStore((state) => state.user);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const selectedWhLabel = useMemo(() => {
    if (selectedWarehouse === "all") return "Tất cả kho";
    const wh = warehouses.find((w: Warehouse) => w.warehouseId === selectedWarehouse);
    return wh ? wh.code : selectedWarehouse;
  }, [selectedWarehouse]);

  const canSeeItem = useCanSeeNavItem();
  const breadcrumbLabels = useBreadcrumbLabelStore((s) => s.labels);
  const breadcrumbItems = buildBreadcrumbItems(pathname, canSeeItem, (id) => breadcrumbLabels[id]);
  const currentUserName = currentUser?.fullName ?? "Người dùng";

  async function handleLogout() {
    setUserMenuOpen(false);
    try {
      await logoutApi();
    } finally {
      router.replace(APP_ROUTES.login);
      router.refresh();
    }
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        // h-svh + overflow-hidden ghi đè `min-h-svh` của SidebarProvider: chiều cao phải
        // BỊ CHẶN để `overflow-auto` của <main> có hiệu lực, nhờ đó topbar/sidebar đứng yên
        // và chỉ vùng nội dung cuộn. Dùng min-h-* thì cả trang cuộn, topbar trôi theo.
        className="bg-bg-surface h-svh overflow-hidden"
        style={
          {
            "--sidebar-width": "240px",
            "--sidebar-width-icon": "60px",
          } as React.CSSProperties
        }
      >
        <BackofficeSidebar />

        {/* ================================================================== */}
        {/*  Main area                                                        */}
        {/* ================================================================== */}
        <SidebarInset className="bg-bg-surface flex min-h-0 min-w-0 flex-col">
          {/* Topbar */}
          <header className="border-border-default bg-bg-surface flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {/* Mobile sidebar trigger */}
            <SidebarTrigger className="text-ink-secondary hover:bg-bg-muted hover:text-ink-primary size-8 shrink-0 md:hidden" />

            <div className="min-w-0 flex-1">
              <nav
                aria-label="Breadcrumb"
                className="text-ink-tertiary flex items-center gap-1.5 text-[0.8125rem]"
              >
                {breadcrumbItems.map((item, index) => (
                  <span
                    key={`${item.label}-${index}`}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {index > 0 && <span className="opacity-50">/</span>}
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="text-ink-secondary hover:text-ink-primary truncate transition-colors"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-ink-primary truncate font-medium">{item.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            </div>

            {/* Global search */}
            <SearchBar
              placeholder="Tìm nhanh (⌘K)"
              className="max-w-[240px]"
              aria-label="Tìm toàn cục"
            />

            <WarehouseSwitcher
              selected={selectedWarehouse}
              onSelect={setSelectedWarehouse}
              label={selectedWhLabel}
            />

            {/* Theme toggle */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              className="border-border-default bg-bg-surface text-ink-secondary hover:bg-bg-muted hover:text-ink-primary rounded-[var(--r-sm)] transition-colors"
              aria-label={theme === "dark" ? "Chuyển sang Light" : "Chuyển sang Dark"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            {/* User menu */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="hover:bg-bg-muted h-auto gap-2 rounded-[var(--r-sm)] bg-transparent px-1 py-0.5 transition-colors"
                aria-label="Mở menu tài khoản"
              >
                <div className="bg-accent flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
                  {currentUserName
                    .split(" ")
                    .slice(-2)
                    .map((word) => word[0])
                    .join("")}
                </div>
              </Button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[800]" onClick={() => setUserMenuOpen(false)} />
                  <div className="border-border-default bg-bg-surface absolute top-full right-0 z-[801] mt-1 w-64 rounded-[var(--r-md)] border py-1 shadow-[var(--sh-lg)]">
                    {/* User info header */}
                    <div className="border-border-default border-b px-3 py-2">
                      <div className="text-ink-primary text-[0.8125rem] font-semibold">
                        {currentUserName}
                      </div>
                      <div className="text-ink-tertiary text-xs">
                        {currentUser?.email ?? "Chưa có thông tin email"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {currentUser?.roles.map((role) => (
                          <span
                            key={role}
                            className="bg-bg-subtle text-ink-secondary rounded-full px-2 py-0.5 text-[0.625rem] font-medium"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Menu items */}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setUserMenuOpen(false)}
                      className="text-ink-secondary hover:bg-bg-muted hover:text-ink-primary h-auto w-full justify-start gap-2 rounded-none bg-transparent px-3 py-1.5 text-[0.8125rem] transition-colors"
                    >
                      <User className="size-3.5" />
                      Hồ sơ cá nhân
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setUserMenuOpen(false)}
                      className="text-ink-secondary hover:bg-bg-muted hover:text-ink-primary h-auto w-full justify-start gap-2 rounded-none bg-transparent px-3 py-1.5 text-[0.8125rem] transition-colors"
                    >
                      <Settings className="size-3.5" />
                      Cài đặt
                    </Button>
                    <div className="border-border-default my-1 border-t" />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleLogout}
                      className="text-danger hover:bg-bg-muted hover:text-danger h-auto w-full justify-start gap-2 rounded-none bg-transparent px-3 py-1.5 text-[0.8125rem] transition-colors"
                    >
                      <LogOut className="size-3.5" />
                      Đăng xuất
                    </Button>
                  </div>
                </>
              )}
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
