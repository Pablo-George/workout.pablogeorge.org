import { Router } from "express";
import { currentUser, isAdmin, requireAuth } from "../middleware/auth.js";
import { handler, sendData } from "../lib/respond.js";
import { getOrCreateInviteToken } from "../services/socialService.js";
import { APP_VERSION } from "../version.js";

const router = Router();

/**
 * The SPA's session probe. Unauthenticated callers get 401 from requireAuth,
 * which is what triggers the redirect to Google.
 */
router.get(
  "/me",
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const inviteToken = await getOrCreateInviteToken(user.userId, user);

    sendData(res, {
      userId: user.userId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      hideWeight: user.hideWeight,
      inviteToken,
      isAdmin: isAdmin(req),
      appVersion: APP_VERSION,
    });
  }),
);

export default router;
