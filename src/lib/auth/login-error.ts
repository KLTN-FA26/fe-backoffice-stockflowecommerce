import { LOGIN_ERROR_FALLBACK, LOGIN_ERROR_MESSAGES } from "@/constants/auth";

import { ApiError } from "@/lib/api/error";

const MESSAGES_BY_CODE: Readonly<Record<string, string | undefined>> = LOGIN_ERROR_MESSAGES;

/**
 * The one login error → copy mapping. Branches on the stable ApiError.code only, never on the
 * server's message text. UNAUTHORIZED is one message for unknown user and wrong password alike.
 */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return (
      (Object.hasOwn(MESSAGES_BY_CODE, error.code) && MESSAGES_BY_CODE[error.code]) ||
      LOGIN_ERROR_FALLBACK
    );
  // Local, already user-facing errors (e.g. demo account not found) keep their own text.
  return error instanceof Error && error.message ? error.message : LOGIN_ERROR_FALLBACK;
}
