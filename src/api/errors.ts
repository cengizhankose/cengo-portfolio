// One error envelope for the API (BE-10, T-01): `{ error, code, issues? }`,
// the right status, `Cache-Control: no-store`, and the request id only in the
// `X-Request-Id` header. Nothing internal (stack, SQL, driver messages) ever
// reaches a response body.
//
// Status / code table of the read-only production API (K-01 = A):
//   400 BAD_PARAM    invalid query value (`lang`, `missingIn`), `issues` filled (BE-05, BE-07)
//   400 BAD_CURSOR   cursor that cannot be decoded (BE-07)
//   400 BAD_REQUEST  any other HTTPException(400)
//   404 NOT_FOUND    unknown resource, draft, invalid slug or unknown /api/* path
//   429 RATE_LIMITED rate limit (BE-18)
//   500 INTERNAL     anything unexpected
// Any other HTTPException status maps to HTTP_<status>; 5xx bodies carry a
// generic text only. The body-related T-01 codes (409/413/422) belong to the publish CLI, not here.
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorFields, log } from "./log";
import type { AppEnv } from "./types";

export interface Issue {
  path: string;
  message: string;
}

export interface ErrorBody {
  error: string;
  code: string;
  issues?: Issue[];
}

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly issues?: Issue[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class BadRequestError extends AppError {
  constructor(code = "BAD_REQUEST", message = "Bad request", issues?: Issue[]) {
    super(400, code, message, issues);
  }
}

/** The 404 body: a draft and an unknown slug get exactly this (SEC-08). */
export const NOT_FOUND_BODY = {
  error: "Not found",
  code: "NOT_FOUND",
} as const satisfies ErrorBody;

const INTERNAL_BODY = {
  error: "Internal Server Error",
  code: "INTERNAL",
} as const satisfies ErrorBody;

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  404: "NOT_FOUND",
  429: "RATE_LIMITED",
  500: "INTERNAL",
};

export const codeForStatus = (status: number): string =>
  CODE_BY_STATUS[status] ?? `HTTP_${status}`;

const NO_STORE = { "Cache-Control": "no-store" };

/** `/api` and `/api/...`, but not `/apix` (a site path). */
export const isApiPath = (path: string): boolean =>
  path === "/api" || path.startsWith("/api/");

// Site paths keep plain-text errors; API clients get the JSON envelope.
function respond(c: Context<AppEnv>, status: ContentfulStatusCode, body: ErrorBody) {
  return isApiPath(c.req.path)
    ? c.json(body, status, NO_STORE)
    : c.text(body.error, status, NO_STORE);
}

// Generic texts for server-side statuses: a 5xx message never reaches the client.
const SERVER_ERROR_TEXT: Partial<Record<number, string>> = {
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

function logUnhandled(err: Error, c: Context<AppEnv>) {
  log("error", "unhandled", {
    reqId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    ...errorFields(err, { stack: true }),
  });
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return respond(c, err.status, {
      error: err.message,
      code: err.code,
      ...(err.issues ? { issues: err.issues } : {}),
    });
  }
  if (err instanceof HTTPException) {
    // Keep headers a middleware attached (e.g. Retry-After), not its body.
    err.res?.headers.forEach((value, key) => {
      if (!/^content-(type|length)$/i.test(key)) c.header(key, value);
    });
    const status = err.status as ContentfulStatusCode;
    if (status >= 500) {
      logUnhandled(err, c);
      return respond(c, status, {
        error: SERVER_ERROR_TEXT[status] ?? "Server error",
        code: codeForStatus(status),
      });
    }
    return respond(c, status, {
      error: err.message || "Request failed",
      code: codeForStatus(status),
    });
  }
  logUnhandled(err, c);
  return respond(c, 500, INTERNAL_BODY);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  respond(c, 404, NOT_FOUND_BODY);
