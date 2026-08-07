import type { Request, Response, NextFunction } from "express";
import type { UserProfile } from "@prisma/client";
import { sendError } from "../lib/respond.js";

/** passport puts the full UserProfile row on req.user via deserializeUser. */
export function currentUser(req: Request): UserProfile {
  const user = req.user as UserProfile | undefined;
  if (!user) throw new Error("currentUser called on an unauthenticated request");
  return user;
}

export function isAdmin(req: Request): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail) && (req.user as UserProfile | undefined)?.userId === adminEmail;
}

/**
 * For browser navigations (the OAuth entry points and the invite landing page).
 * Redirects to the login page, remembering where the user was headed.
 */
export function ensureAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next();
  (req.session as unknown as { returnTo?: string }).returnTo = req.originalUrl;
  res.redirect("/login");
}

/**
 * For /api/*. Answers 401 instead of redirecting to HTML.
 *
 * This is the difference that makes an expired session detectable from the SPA:
 * a fetch() follows a 302 transparently and would otherwise receive the login
 * page with a 200, which is indistinguishable from success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next();
  sendError(res, 401, "Not authenticated");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) return sendError(res, 401, "Not authenticated");
  if (!isAdmin(req)) return sendError(res, 403, "Forbidden");
  next();
}
