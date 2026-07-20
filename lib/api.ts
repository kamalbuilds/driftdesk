import { NextResponse } from "next/server";

/**
 * Shared helpers so every studio API route returns consistent JSON, disables
 * caching for data endpoints, and never leaks a raw stack trace to clients.
 */

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export function jsonOk<T extends Record<string, unknown>>(body: T, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init.headers ?? {}) } });
}

export function jsonError(message: string, status = 500): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status, headers: NO_STORE_HEADERS });
}

/**
 * Wrap a route handler so any thrown error becomes a clean 500 with a logged
 * server-side stack, rather than an unhandled rejection or an HTML error page.
 */
export function withRouteErrors(handler: (req: Request) => Promise<NextResponse>): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(`Route error on ${req.url}:`, error);
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      return jsonError(message, 500);
    }
  };
}
