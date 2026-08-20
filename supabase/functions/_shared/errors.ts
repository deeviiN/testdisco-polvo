// Shared error logging + structured response helper for all edge functions.
// Import like:
//   import { logError, errorResponse, jsonResponse, ErrorCodes, AppError } from "../_shared/errors.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

/**
 * Canonical error codes used across all edge functions.
 * Clients can switch on these to render deterministic UX.
 */
export const ErrorCodes = {
  // Auth / authorization
  UNAUTHORIZED: "UNAUTHORIZED",                 // 401 — missing/invalid token
  FORBIDDEN: "FORBIDDEN",                       // 403 — authenticated but no permission
  SESSION_EXPIRED: "SESSION_EXPIRED",           // 401 — token expired/invalid claims

  // Input
  VALIDATION_FAILED: "VALIDATION_FAILED",       // 400 — body/query/params invalid
  BAD_REQUEST: "BAD_REQUEST",                   // 400 — generic malformed request
  MISSING_PARAMETER: "MISSING_PARAMETER",       // 400 — required param absent

  // Resources
  NOT_FOUND: "NOT_FOUND",                       // 404
  CONFLICT: "CONFLICT",                         // 409 — duplicate / state conflict
  RATE_LIMITED: "RATE_LIMITED",                 // 429

  // Server / infra
  DB_ERROR: "DB_ERROR",                         // 500 — database failure
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR", // 502 — upstream API failure
  CONFIG_ERROR: "CONFIG_ERROR",                 // 500 — missing env/secret
  INTERNAL_ERROR: "INTERNAL_ERROR",             // 500 — uncategorized
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",           // 501
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/** Default HTTP status for each error code. */
const DEFAULT_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  SESSION_EXPIRED: 401,
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  MISSING_PARAMETER: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DB_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 502,
  CONFIG_ERROR: 500,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
};

/** Throwable error carrying a canonical code + safe public message. */
export class AppError extends Error {
  code: ErrorCode;
  status: number;
  publicMessage: string;
  details?: unknown;

  constructor(code: ErrorCode, publicMessage: string, opts?: { status?: number; details?: unknown; cause?: unknown }) {
    super(publicMessage);
    this.name = "AppError";
    this.code = code;
    this.status = opts?.status ?? DEFAULT_STATUS[code];
    this.publicMessage = publicMessage;
    this.details = opts?.details;
    if (opts?.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export interface ErrorContext {
  fn: string;            // function name (e.g. "school-staff-emails")
  step?: string;         // logical step where it failed
  userId?: string | null;
  schoolId?: string | null;
  extra?: Record<string, unknown>;
}

export function logError(err: unknown, ctx: ErrorContext) {
  const e = err as { message?: string; stack?: string; code?: string; status?: number; name?: string };
  const payload = {
    level: "error",
    timestamp: new Date().toISOString(),
    fn: ctx.fn,
    step: ctx.step ?? null,
    user_id: ctx.userId ?? null,
    school_id: ctx.schoolId ?? null,
    error: {
      name: e?.name ?? "Error",
      message: e?.message ?? String(err),
      code: e?.code ?? null,
      status: e?.status ?? null,
      stack: e?.stack ?? null,
    },
    extra: ctx.extra ?? null,
  };
  // Single-line JSON makes it easy to search in Supabase function logs.
  console.error(JSON.stringify(payload));
  return payload;
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Map an arbitrary thrown value to a canonical ErrorCode + status.
 * Honors AppError, then falls back to PostgREST/Postgres codes, then a default.
 */
function inferCodeAndStatus(err: unknown, fallbackStatus: number): { code: ErrorCode; status: number } {
  if (err instanceof AppError) {
    return { code: err.code, status: err.status };
  }
  const e = err as { code?: string; status?: number; message?: string };
  const status = e?.status ?? fallbackStatus;

  // PostgREST / Postgres common codes
  if (e?.code === "PGRST116") return { code: ErrorCodes.NOT_FOUND, status: 404 };
  if (e?.code === "23505") return { code: ErrorCodes.CONFLICT, status: 409 };
  if (e?.code === "23503") return { code: ErrorCodes.VALIDATION_FAILED, status: 400 };
  if (e?.code === "42501") return { code: ErrorCodes.FORBIDDEN, status: 403 };
  if (typeof e?.code === "string" && e.code.startsWith("PGRST")) {
    return { code: ErrorCodes.DB_ERROR, status: status >= 400 ? status : 500 };
  }

  // HTTP-style status fallback
  if (status === 401) return { code: ErrorCodes.UNAUTHORIZED, status };
  if (status === 403) return { code: ErrorCodes.FORBIDDEN, status };
  if (status === 404) return { code: ErrorCodes.NOT_FOUND, status };
  if (status === 409) return { code: ErrorCodes.CONFLICT, status };
  if (status === 429) return { code: ErrorCodes.RATE_LIMITED, status };
  if (status === 400) return { code: ErrorCodes.BAD_REQUEST, status };

  return { code: ErrorCodes.INTERNAL_ERROR, status: status >= 400 ? status : 500 };
}

export function errorResponse(
  err: unknown,
  ctx: ErrorContext,
  statusOrCode: number | ErrorCode = 500,
  publicMessage?: string,
) {
  const logged = logError(err, ctx);
  const e = err as { message?: string };

  let code: ErrorCode;
  let status: number;

  if (typeof statusOrCode === "string") {
    code = statusOrCode;
    status = err instanceof AppError ? err.status : DEFAULT_STATUS[statusOrCode];
  } else {
    const inferred = inferCodeAndStatus(err, statusOrCode);
    code = inferred.code;
    status = inferred.status;
  }

  const message =
    publicMessage ??
    (err instanceof AppError ? err.publicMessage : e?.message) ??
    "Internal Server Error";

  return jsonResponse(
    {
      error: message,
      code,
      fn: ctx.fn,
      step: ctx.step ?? null,
      timestamp: logged.timestamp,
      ...(err instanceof AppError && err.details ? { details: err.details } : {}),
    },
    status,
  );
}
