import { Router } from "express";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, sendData } from "../lib/respond.js";
import { resolveLocalDate } from "../lib/dates.js";
import { buildGoalSummary } from "../services/goalService.js";
import { buildTrainingSummary } from "../services/trainingSummary.js";

const router = Router();
router.use(apiAuth);

router.get(
  "/",
  handler(async (req, res) => {
    const user = currentUser(req);
    const [latestWeight, totalSessions, activityLogs] = await Promise.all([
      prisma.bodyWeightLog.findFirst({ where: { userId: user.userId }, orderBy: { loggedOn: "desc" } }),
      prisma.workoutLog.count({ where: { userId: user.userId } }),
      prisma.workoutLog.findMany({ where: { userId: user.userId }, include: { lift: true }, orderBy: [{ completedOn: "desc" }, { id: "desc" }] }),
    ]);
    const training = buildTrainingSummary(activityLogs);

    sendData(res, {
      userId: user.userId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      hideWeight: user.hideWeight,
      currentWeightLbs: latestWeight?.weightLbs ?? null,
      currentWeightDate: latestWeight?.loggedOn ?? null,
      totalSessions,
      totalPrs: training.totalPrs,
    });
  })
);

router.post(
  "/weight",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const weightLbs = Number(req.body?.weightLbs);
    if (!Number.isFinite(weightLbs) || weightLbs <= 0) throw badRequest("Invalid weight");
    const loggedOn = resolveLocalDate(req.body?.loggedOn);
    await prisma.bodyWeightLog.upsert({
      where: { userId_loggedOn: { userId, loggedOn } },
      update: { weightLbs },
      create: { userId, weightLbs, loggedOn },
    });
    sendData(res, { weightLbs, loggedOn }, 201);
  })
);

router.get(
  "/weight/chart",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
    const history = await prisma.bodyWeightLog.findMany({
      where: { userId, loggedOn: { gte: ninetyDaysAgo.toISOString().split("T")[0] } },
      orderBy: { loggedOn: "asc" },
    });
    sendData(res, history.map((w) => ({ date: w.loggedOn, weight: w.weightLbs })));
  })
);

router.post(
  "/goal",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const goalWeightLbs = req.body?.goalWeightLbs === null ? null : Number(req.body?.goalWeightLbs);
    if (goalWeightLbs !== null && (!Number.isFinite(goalWeightLbs) || goalWeightLbs <= 0)) throw badRequest("Invalid goal weight");
    await prisma.userProfile.update({ where: { userId }, data: { goalWeightLbs } });
    sendData(res, await buildGoalSummary(userId));
  })
);

router.get(
  "/goal",
  handler(async (req, res) => {
    sendData(res, await buildGoalSummary(currentUser(req).userId));
  })
);

router.post(
  "/privacy",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const current = await prisma.userProfile.findUnique({ where: { userId } });
    const hideWeight = !current?.hideWeight;
    await prisma.userProfile.update({ where: { userId }, data: { hideWeight } });
    sendData(res, { hideWeight });
  })
);

export default router;
