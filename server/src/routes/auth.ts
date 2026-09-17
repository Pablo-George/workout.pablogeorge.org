import { Router } from "express";
import passport from "passport";
import { APPLE_SIGNIN_ENABLED } from "../config/features.js";
import { signNativeToken } from "../middleware/auth.js";

const router = Router();

// The native iOS app signs in through an ASWebAuthenticationSession pointed
// directly at /auth/google?client=ios or /auth/apple?client=ios (skipping
// /login's button tap), which doesn't share cookie storage with the app's
// own networking layer. `?client=ios` is stashed in the session here so it
// survives the redirect out to Google/Apple and back; the callback handlers
// below check it to decide whether to hand back a JWT (via a custom URL
// scheme redirect the session is watching for) instead of a normal cookie
// session. /login itself also checks it, for the web login page's own
// Google/Apple buttons in case something ever links there with ?client=ios.
function markNativeClient(req: any) {
  if (req.query.client === "ios") req.session.nativeClient = true;
}

router.get("/login", (req, res) => {
  markNativeClient(req);
  res.render("login", { appleSigninEnabled: APPLE_SIGNIN_ENABLED });
});

function finishAuth(req: any, res: any) {
  const returnTo = req.session.returnTo || "/";
  delete req.session.returnTo;

  if (req.session.nativeClient) {
    delete req.session.nativeClient;
    const token = signNativeToken(req.user.userId);
    return res.redirect(`workoutapp://auth?token=${encodeURIComponent(token)}`);
  }
  res.redirect(returnTo);
}

router.get(
  "/auth/google",
  (req, _res, next) => { markNativeClient(req); next(); },
  passport.authenticate("google", { scope: ["openid", "profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  finishAuth
);

if (APPLE_SIGNIN_ENABLED) {
  router.get(
    "/auth/apple",
    (req, _res, next) => { markNativeClient(req); next(); },
    passport.authenticate("apple")
  );

  // Apple posts back here (response_mode: "form_post"), not a GET redirect.
  router.post(
    "/auth/apple/callback",
    passport.authenticate("apple", { failureRedirect: "/login" }),
    finishAuth
  );
}

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

export default router;
