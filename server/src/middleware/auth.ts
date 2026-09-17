import type { Request, Response, NextFunction } from "express";
import type { UserProfile } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { sendError } from "../lib/respond.js";

/** passport puts the full UserProfile row on req.user via deserializeUser. */
export function currentUser(req: Request): UserProfile {
  const user = req.user as UserProfile | undefined;
  if (!user) throw new Error("currentUser called on an unauthenticated request");
  return user;
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
 * For /api/music/*, which the EJS pages call via fetch(). Answers 401 instead
 * of redirecting to HTML, since a fetch() follows a 302 transparently and
 * would otherwise receive the login page with a 200.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next();
  sendError(res, 401, "Not authenticated");
}

const NATIVE_JWT_SECRET = process.env.SESSION_SECRET || "dev-secret";
const NATIVE_JWT_EXPIRY = "180d";

export function signNativeToken(userId: string): string {
  return jwt.sign({ userId }, NATIVE_JWT_SECRET, { expiresIn: NATIVE_JWT_EXPIRY });
}

/**
 * For the native iOS app's /api/* calls, which carry no session cookie (it
 * isn't sharing cookie storage with the WKWebView ASWebAuthenticationSession
 * used to sign in). Accepts either an existing cookie session (so the same
 * routes also work from the web PWA) or an `Authorization: Bearer <jwt>`
 * minted by signNativeToken() after OAuth completes.
 */
export async function apiAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.isAuthenticated()) return next();

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), NATIVE_JWT_SECRET) as { userId: string };
      const user = await prisma.userProfile.findUnique({ where: { userId: payload.userId } });
      if (user) {
        (req as unknown as { user: UserProfile }).user = user;
        return next();
      }
    } catch {
      // falls through to 401 below
    }
  }
  sendError(res, 401, "Not authenticated");
}
