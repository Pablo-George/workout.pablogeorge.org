import { Router } from "express";
import passport from "passport";
import { APPLE_SIGNIN_ENABLED } from "../config/features.js";

const router = Router();

router.get("/login", (req, res) => {
  res.render("login", { appleSigninEnabled: APPLE_SIGNIN_ENABLED });
});

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["openid", "profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    const returnTo = (req.session as any).returnTo || "/";
    delete (req.session as any).returnTo;
    res.redirect(returnTo);
  }
);

if (APPLE_SIGNIN_ENABLED) {
  router.get("/auth/apple", passport.authenticate("apple"));

  // Apple posts back here (response_mode: "form_post"), not a GET redirect.
  router.post(
    "/auth/apple/callback",
    passport.authenticate("apple", { failureRedirect: "/login" }),
    (req, res) => {
      const returnTo = (req.session as any).returnTo || "/";
      delete (req.session as any).returnTo;
      res.redirect(returnTo);
    }
  );
}

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

export default router;
