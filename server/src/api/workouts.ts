import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import {
  completeWorkout,
  createConfig,
  getConfig,
  getWeekLabels,
  updateTrainingMax,
} from "../services/workoutService.js";

const router = Router();

const DEFAULT_LIFTS = ["Bench Press", "Squat", "Deadlift", "Overhead Press"];

/**
 * Every lift mutation goes through this.
 *
 * The routes this replaces looked lifts up by id alone, so any signed-in user
 * could delete or reconfigure another user's lift by guessing the number.
 */
async function requireOwnedLift(userId: string, liftId: number) {
  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift || lift.userId !== userId) throw notFound("Lift not found");
  return lift;
}

router.get(
  "/",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);

    // First visit bootstrap, previously a side effect of rendering the home page.
    const existing = await prisma.coreWorkout.count({ where: { userId } });
    if (existing === 0) {
      await prisma.coreWorkout.createMany({
        data: DEFAULT_LIFTS.map((name) => ({ name, userId })),
      });
    }

    const [lifts, configs, weekLabels] = await Promise.all([
      prisma.coreWorkout.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      prisma.userLiftConfig.findMany({ where: { userId } }),
      getWeekLabels(userId),
    ]);

    const configByLiftId = new Map(configs.map((c) => [c.liftId, c]));
    sendData(
      res,
      lifts.map((lift) => ({
        id: lift.id,
        name: lift.name,
        trainingMax: configByLiftId.get(lift.id)?.trainingMax ?? null,
        currentWeek: configByLiftId.get(lift.id)?.currentWeek ?? null,
        weekLabel: (weekLabels as Record<number, string>)[lift.id] ?? null,
      })),
    );
  }),
);

router.post(
  "/lifts",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const name = String(req.body?.name ?? "").trim();
    if (!name) throw badRequest("Name is required");
    if (name.length > 60) throw badRequest("Name is too long");

    const duplicate = await prisma.coreWorkout.findFirst({ where: { userId, name } });
    if (duplicate) throw badRequest("You already have a lift with that name");

    const lift = await prisma.coreWorkout.create({ data: { name, userId } });
    sendData(res, { id: lift.id, name: lift.name, trainingMax: null, currentWeek: null, weekLabel: null }, 201);
  }),
);

router.delete(
  "/lifts/:liftId",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const liftId = intParam(req.params.liftId, "liftId");
    await requireOwnedLift(userId, liftId);

    const auxLifts = await prisma.auxLift.findMany({ where: { liftId }, select: { id: true } });
    const auxIds = auxLifts.map((a) => a.id);

    // Wrapped so a mid-sequence failure can't leave a half-deleted lift. Postgres
    // will enforce the foreign keys that SQLite currently does not.
    await prisma.$transaction([
      prisma.auxLiftLog.deleteMany({ where: { auxLiftId: { in: auxIds } } }),
      prisma.auxLift.deleteMany({ where: { liftId } }),
      prisma.userLiftConfig.deleteMany({ where: { liftId } }),
      prisma.workoutLog.deleteMany({ where: { liftId } }),
      prisma.trainingMaxLog.deleteMany({ where: { liftId } }),
      prisma.coreWorkout.delete({ where: { id: liftId } }),
    ]);

    res.status(204).end();
  }),
);

router.put(
  "/:liftId/training-max",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const liftId = intParam(req.params.liftId, "liftId");
    const trainingMax = Number(req.body?.trainingMax);
    if (!Number.isFinite(trainingMax) || trainingMax < 45) {
      throw badRequest("Training max must be at least 45 lbs");
    }

    const lift = await requireOwnedLift(userId, liftId);
    const config = await getConfig(userId, liftId);
    if (config) {
      await updateTrainingMax(config, trainingMax, req.body?.loggedOn);
    } else {
      await createConfig(userId, lift, trainingMax, req.body?.loggedOn);
    }
    // Aux lifts are generated against a specific training max, so they no
    // longer apply once it moves.
    await prisma.auxLift.deleteMany({ where: { userId, liftId } });

    const updated = await getConfig(userId, liftId);
    sendData(res, { trainingMax, currentWeek: updated?.currentWeek ?? 1 });
  }),
);

router.put(
  "/:liftId/week",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const liftId = intParam(req.params.liftId, "liftId");
    const week = Number(req.body?.week);
    if (!Number.isInteger(week) || week < 1 || week > 4) throw badRequest("Week must be 1-4");

    await requireOwnedLift(userId, liftId);
    const config = await getConfig(userId, liftId);
    if (!config) throw badRequest("Set a training max before choosing a week");

    await prisma.userLiftConfig.update({ where: { id: config.id }, data: { currentWeek: week } });
    sendData(res, { trainingMax: config.trainingMax, currentWeek: week });
  }),
);

router.post(
  "/:liftId/complete",
  requireAuth,
  handler(async (req, res) => {
    const { userId } = currentUser(req);
    const liftId = intParam(req.params.liftId, "liftId");
    const amrapReps = Number(req.body?.amrapReps);
    // The old route parsed this with parseInt and wrote NaN to the column when
    // the field was missing.
    if (!Number.isInteger(amrapReps) || amrapReps < 0 || amrapReps > 99) {
      throw badRequest("AMRAP reps must be between 0 and 99");
    }

    await requireOwnedLift(userId, liftId);
    const config = await getConfig(userId, liftId);
    if (!config) throw badRequest("Lift is not set up yet");

    const result = await completeWorkout(config, amrapReps, req.body?.completedOn);
    await prisma.auxLift.deleteMany({ where: { userId, liftId } });

    const updated = await getConfig(userId, liftId);
    sendData(res, { currentWeek: updated?.currentWeek ?? 1, ...result });
  }),
);

export default router;
