import { backendProxyHandler } from "@/lib/auth/server/handlers";

import type { NextRequest } from "next/server";

async function handle(request: NextRequest, context: RouteContext<"/api/backend/[...path]">) {
  const { path } = await context.params;
  return backendProxyHandler(request, path);
}
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
