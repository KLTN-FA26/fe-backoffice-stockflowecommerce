/**
 * Login page — supports mock staff selection and real backend credentials.
 */

"use client";

import {
  ArrowLeft,
  Boxes,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

import { ADMIN_ROUTES, APP_ROUTES } from "@/constants";
import { AUTH_UI } from "@/constants/auth";

import { getMockLoginUsersApi, loginApi, mockLoginApi } from "@/lib/auth/auth-api";
import { loginErrorMessage } from "@/lib/auth/login-error";
import { useAuthLifecycle } from "@/lib/auth/use-auth-lifecycle";

import { useIsMock } from "@/providers/app-providers";

import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { MockLoginUser } from "@/lib/auth/auth-api";
import type { FormEvent } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginPageFallback() {
  return (
    <main className="bg-bg-base flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4" role="status">
        <Logo height={38} />
        <LoaderCircle className="text-accent size-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Đang tải trang đăng nhập</span>
      </div>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallback = searchParams.get("callbackUrl");
  const callbackUrl = requestedCallback?.startsWith(`${ADMIN_ROUTES.home}/`)
    ? requestedCallback
    : ADMIN_ROUTES.home;
  const isMock = useIsMock();
  const { status, isAuthenticated, bootstrapError, retry } = useAuthLifecycle();

  useEffect(() => {
    if (isAuthenticated) router.replace(callbackUrl);
  }, [callbackUrl, isAuthenticated, router]);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mockUsers, setMockUsers] = useState<MockLoginUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(isMock);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isMock) return;

    let cancelled = false;
    void getMockLoginUsersApi()
      .then((users) => {
        if (cancelled) return;
        setMockUsers(users);
        setSelectedUserId(users[0]?.userId ?? "");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải danh sách tài khoản demo.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isMock]);

  function completeLogin() {
    router.replace(callbackUrl);
    router.refresh();
  }

  function handleMockLogin() {
    if (!selectedUserId) return;
    setError(null);

    startTransition(async () => {
      try {
        await mockLoginApi(selectedUserId);
        completeLogin();
      } catch (loginError: unknown) {
        setError(loginErrorMessage(loginError));
      }
    });
  }

  function handleRealLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username || !password) return;
    setError(null);

    startTransition(async () => {
      try {
        await loginApi({ username, password });
        completeLogin();
      } catch (loginError: unknown) {
        setError(loginErrorMessage(loginError));
      }
    });
  }

  if (status === "unknown" && bootstrapError)
    return (
      <main className="bg-bg-base flex min-h-screen items-center justify-center">
        <div role="alert">
          {bootstrapError}
          <Button onClick={retry}>{AUTH_UI.retry}</Button>
        </div>
      </main>
    );
  if (status === "unknown" || isAuthenticated) return <LoginPageFallback />;

  const selectedUser = mockUsers.find((user) => user.userId === selectedUserId);

  return (
    <main className="bg-bg-base min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <section className="border-border-default bg-brand text-ink-inverse relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="border-ink-inverse/10 absolute -top-24 -left-24 size-80 rounded-full border" />
        <div className="border-ink-inverse/10 absolute -top-10 -left-10 size-80 rounded-full border" />

        <Link
          href={APP_ROUTES.home}
          className="focus-visible:ring-ink-inverse relative w-fit rounded-[var(--r-sm)] focus-visible:ring-2"
          aria-label="StockFlowCommerce — về trang chủ"
        >
          {/* Logo là ảnh minh hoạ full-color — không áp filter trắng như bản SVG cũ,
              nếu không ảnh sẽ biến thành khối trắng đặc. */}
          <Logo height={42} />
        </Link>

        <div className="relative max-w-xl py-12">
          <div className="border-ink-inverse/20 bg-ink-inverse/10 mb-6 flex size-12 items-center justify-center rounded-[var(--r-sm)] border">
            <Warehouse className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
            Bắt đầu ca làm việc với dữ liệu bạn cần.
          </h1>
          <p className="text-ink-inverse/70 mt-5 max-w-[56ch] text-base leading-7">
            Truy cập nhanh các tác vụ mua hàng, tồn kho và hoàn tất đơn trong một không gian được
            phân quyền theo vai trò.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Nhập hàng", icon: Boxes },
              { label: "Kiểm soát kho", icon: ShieldCheck },
              { label: "Quét & xử lý", icon: ScanLine },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="border-ink-inverse/15 bg-ink-inverse/5 rounded-[var(--r-sm)] border p-4"
              >
                <Icon className="size-5" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-ink-inverse/50 relative text-xs">
          Chỉ dành cho nhân sự StockFlowCommerce được cấp quyền.
        </p>
      </section>

      <section className="bg-bg-surface flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <Link
            href={APP_ROUTES.home}
            className="text-ink-secondary hover:text-ink-primary flex items-center gap-2 rounded-[var(--r-sm)] text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Trang chủ
          </Link>
          {isMock && (
            <span className="border-warning/30 bg-warning/10 text-warning rounded-full border px-2.5 py-1 text-xs font-medium">
              Môi trường demo
            </span>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <div className="mb-10 lg:hidden">
            <Logo height={40} />
          </div>

          <div className="mb-8">
            <div className="bg-bg-subtle text-accent mb-5 flex size-11 items-center justify-center rounded-[var(--r-sm)]">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <h2 className="text-ink-primary font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
              Chào mừng trở lại
            </h2>
            <p className="text-ink-secondary mt-2 text-sm leading-6">
              {isMock
                ? "Chọn một tài khoản nhân sự để truy cập dữ liệu demo."
                : "Đăng nhập bằng tài khoản nội bộ đã được cấp cho bạn."}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="border-danger/30 bg-danger/10 text-danger mb-5 rounded-[var(--r-sm)] border px-4 py-3 text-sm"
            >
              {error}
            </div>
          )}

          {isMock ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="mock-user">Tài khoản nhân sự</Label>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  disabled={isLoadingUsers || mockUsers.length === 0}
                >
                  <SelectTrigger
                    id="mock-user"
                    className="border-border-default bg-bg-surface h-11 w-full rounded-[var(--r-sm)]"
                  >
                    <SelectValue
                      placeholder={isLoadingUsers ? "Đang tải tài khoản..." : "Chọn tài khoản"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {mockUsers.map((user) => (
                      <SelectItem key={user.userId} value={user.userId}>
                        {user.fullName} — {user.roles.join(", ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && (
                <div className="border-border-default bg-bg-subtle rounded-[var(--r-sm)] border p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-accent text-ink-inverse flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                      {selectedUser.fullName
                        .split(" ")
                        .slice(-2)
                        .map((word) => word[0])
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-ink-primary truncate text-sm font-semibold">
                        {selectedUser.fullName}
                      </p>
                      <p className="text-ink-tertiary truncate text-xs">{selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedUser.roles.map((role) => (
                      <span
                        key={role}
                        className="border-border-default bg-bg-surface text-ink-secondary rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full rounded-[var(--r-sm)]"
                onClick={handleMockLogin}
                disabled={isPending || isLoadingUsers || !selectedUserId}
              >
                {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {isPending ? "Đang đăng nhập..." : "Đăng nhập vào hệ thống"}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRealLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Tên đăng nhập"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  className="h-11 rounded-[var(--r-sm)]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="h-11 rounded-[var(--r-sm)] pr-11"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="text-ink-tertiary hover:text-ink-primary absolute top-1/2 right-1 -translate-y-1/2 rounded-[var(--r-sm)]"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full rounded-[var(--r-sm)]"
                disabled={isPending}
              >
                {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {isPending ? "Đang đăng nhập..." : "Đăng nhập vào hệ thống"}
              </Button>
            </form>
          )}

          <div className="border-border-default text-ink-tertiary mt-8 flex items-start gap-3 border-t pt-5 text-xs leading-5">
            <ShieldCheck className="text-positive mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Phiên đăng nhập được bảo vệ và giới hạn theo quyền của tài khoản.
          </div>
        </div>
      </section>
    </main>
  );
}
