import type { Context } from "hono";

/**
 * Typed application error. Route handlers throw this;
 * the global error handler translates it to a JSON response.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string, details?: unknown): never {
  throw new AppError(400, message, details);
}

export function unauthorized(message = "Not authenticated"): never {
  throw new AppError(401, message);
}

export function forbidden(message = "Forbidden"): never {
  throw new AppError(403, message);
}

export function notFound(message: string): never {
  throw new AppError(404, message);
}

export function conflict(message: string): never {
  throw new AppError(409, message);
}

/** Global Hono error handler — keeps JSON shape consistent. */
export function handleError(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, err.status as any);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
}
