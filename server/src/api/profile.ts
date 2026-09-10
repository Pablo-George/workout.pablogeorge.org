import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, handler, sendData } from "../lib/respond.js";
import { resolveLocalDate } from "../lib/dates.js";

const router = Router();

router.post(
  "/weight",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const weightLbs = Number(req.body?.weightLbs);
    // Matches the bounds the old form input enforced client-side. The server
    // never checked, so a NaN could be written straight to the column.
    if (!Number.isFinite(weightLbs) || weightLbs < 50 || weightLbs > 999) {
      throw badRequest("Weight must be between 50 and 999 lbs");
    }

    // The client sends its own local calendar day, since the server's UTC
    // day can be a day off from the user's around midnight, which was
    // causing today's entry to silently overwrite yesterday's.
    const loggedOn = resolveLocalDate(req.body?.loggedOn);
    await prisma.bodyWeightLog.upsert({
      where: { userId_loggedOn: { userId, loggedOn } },
      update: { weightLbs },
      create: { userId, weightLbs, loggedOn },
    });

    sendData(res, { weightLbs, loggedOn });
  }),
);

router.post(
  "/privacy",
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const hideWeight = !user.hideWeight;
    await prisma.userProfile.update({ where: { userId: user.userId }, data: { hideWeight } });
    sendData(res, { hideWeight });
  }),
);

router.post(
  "/invite/reset",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const inviteToken = crypto.randomBytes(16).toString("hex");
    await prisma.userProfile.update({ where: { userId }, data: { inviteToken } });
    sendData(res, { inviteToken });
  }),
);

export default router;
