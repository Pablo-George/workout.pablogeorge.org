import type { Request, Response, NextFunction } from "express";

export function ensureAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  (req.session as any).returnTo = req.originalUrl;
  res.redirect("/login");
}
