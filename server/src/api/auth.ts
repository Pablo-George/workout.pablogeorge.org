import { Router } from "express";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { handler, sendData } from "../lib/respond.js";

const router = Router();

/** The native app calls this on launch to check whether its stored token is
 *  still good and to refresh the cached profile (name/picture). */
router.get(
  "/me",
  apiAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    sendData(res, { userId: user.userId, displayName: user.displayName, pictureUrl: user.pictureUrl });
  })
);

export default router;
