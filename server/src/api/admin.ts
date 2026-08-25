import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";

const router = Router();

router.use(requireAdmin);

/**
 * User list only.
 *
 * The admin page this replaces loaded every training max log, weight log and
 * calorie entry in the database on every render, then filtered them in JS.
 * Detail is now fetched per user, on demand.
 */
router.get(
  "/users",
  handler(async (_req, res) => {
    const [profiles, tmCounts] = await Promise.all([
      prisma.userProfile.findMany({ orderBy: { userId: "asc" } }),
      prisma.trainingMaxLog.groupBy({ by: ["userId"], _count: { _all: true } }),
    ]);

    const countByUser = new Map(tmCounts.map((c) => [c.userId, c._count._all]));
    sendData(res, {
      totalLogs: tmCounts.reduce((sum, c) => sum + c._count._all, 0),
      users: profiles.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        tmLogCount: countByUser.get(p.userId) ?? 0,
      })),
    });
  }),
);

router.get(
  "/users/:userId",
  handler(async (req, res) => {
    const { userId } = req.params;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) throw notFound("User not found");

    const [tmLogs, tmConfigs, weightLogs, calEntries] = await Promise.all([
      prisma.trainingMaxLog.findMany({
        where: { userId },
        orderBy: [{ liftId: "asc" }, { loggedOn: "asc" }],
        include: { lift: { select: { name: true } } },
      }),
      prisma.userLiftConfig.findMany({
        where: { userId },
        include: { lift: { select: { name: true } } },
        orderBy: { liftId: "asc" },
      }),
      prisma.bodyWeightLog.findMany({ where: { userId }, orderBy: { loggedOn: "desc" }, take: 15 }),
      prisma.calorieEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);

    // Grouped by lift for the collapsible history the admin page renders.
    const byLift = new Map<string, typeof tmLogs>();
    for (const log of tmLogs) {
      const bucket = byLift.get(log.lift.name);
      if (bucket) bucket.push(log);
      else byLift.set(log.lift.name, [log]);
    }

    sendData(res, {
      userId: profile.userId,
      displayName: profile.displayName,
      tmLogs: [...byLift].map(([liftName, entries]) => ({ liftName, entries })),
      tmConfigs,
      weightLogs,
      calEntries,
    });
  }),
);

router.patch(
  "/tm-configs/:id",
  handler(async (req, res) => {
    const id = intParam(req.params.id);
    const patch: { trainingMax?: number; currentWeek?: number } = {};

    if (req.body?.trainingMax !== undefined) {
      const trainingMax = Number(req.body.trainingMax);
      if (!Number.isFinite(trainingMax) || trainingMax < 0) throw badRequest("Invalid training max");
      patch.trainingMax = trainingMax;
    }
    if (req.body?.currentWeek !== undefined) {
      const currentWeek = Number(req.body.currentWeek);
      if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > 4) {
        throw badRequest("Week must be 1-4");
      }
      patch.currentWeek = currentWeek;
    }
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

    sendData(res, await prisma.userLiftConfig.update({ where: { id }, data: patch }));
  }),
);

router.patch(
  "/weights/:id",
  handler(async (req, res) => {
    const id = intParam(req.params.id);
    const weightLbs = Number(req.body?.weightLbs);
    if (!Number.isFinite(weightLbs) || weightLbs <= 0) throw badRequest("Invalid weight");
    sendData(res, await prisma.bodyWeightLog.update({ where: { id }, data: { weightLbs } }));
  }),
);

router.delete(
  "/weights/:id",
  handler(async (req, res) => {
    await prisma.bodyWeightLog.delete({ where: { id: intParam(req.params.id) } });
    res.status(204).end();
  }),
);

router.patch(
  "/cals/:id",
  handler(async (req, res) => {
    const id = intParam(req.params.id);
    const patch: { calories?: number; description?: string } = {};

    if (req.body?.calories !== undefined) {
      const calories = Number(req.body.calories);
      if (!Number.isFinite(calories) || calories < 0) throw badRequest("Invalid calories");
      patch.calories = Math.round(calories);
    }
    if (req.body?.description !== undefined) {
      const description = String(req.body.description).trim();
      if (!description) throw badRequest("Description cannot be empty");
      patch.description = description;
    }
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

    sendData(res, await prisma.calorieEntry.update({ where: { id }, data: patch }));
  }),
);

router.delete(
  "/cals/:id",
  handler(async (req, res) => {
    await prisma.calorieEntry.delete({ where: { id: intParam(req.params.id) } });
    res.status(204).end();
  }),
);

router.delete(
  "/tm-logs/:id",
  handler(async (req, res) => {
    await prisma.trainingMaxLog.delete({ where: { id: intParam(req.params.id) } });
    res.status(204).end();
  }),
);

router.delete(
  "/tm-logs/user/:userId",
  handler(async (req, res) => {
    const { count } = await prisma.trainingMaxLog.deleteMany({
      where: { userId: req.params.userId },
    });
    sendData(res, { deleted: count });
  }),
);

/** Drops the generated-guide cache so the images regenerate on next request. */
router.post(
  "/guides/clear",
  handler(async (_req, res) => {
    const { count } = await prisma.exerciseGuide.deleteMany({});
    sendData(res, { deleted: count });
  }),
);

export default router;
