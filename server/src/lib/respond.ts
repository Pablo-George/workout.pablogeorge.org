import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Every /api response is either { data } or { error }. The old routes were
 * inconsistent about this — POST /cals/update/:id returned JSON while its
 * sibling POST /cals/delete/:id sent a 302, and the admin routes mixed
 * 403 JSON with redirects.
 */

export function sendData<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

/** Thrown by handlers to produce a specific status without a manual return. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m = "Invalid request") => new HttpError(400, m);
export const forbidden = (m = "Forbidden") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 * Express 4 does not do this itself: an unhandled rejection there means no
 * response is ever sent, which on Lambda burns the full function timeout.
 */
export function handler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** Parses a route param that must be a positive integer id. */
export function intParam(value: string | undefined, name = "id"): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`Invalid ${name}`);
  return parsed;
}

export function apiErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    sendError(res, err.status, err.message);
    return;
  }

  // Multer rejects oversized uploads with this code.
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
    sendError(res, 413, "Image is too large");
    return;
  }

  console.error("[api]", err);
  sendError(res, 500, "Something went wrong");
}
