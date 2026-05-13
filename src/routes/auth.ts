import { Router } from "express";
import passport from "passport";

const router = Router();

router.get("/login", (req, res) => {
  res.render("login");
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

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

export default router;
