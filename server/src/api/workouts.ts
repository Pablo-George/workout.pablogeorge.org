import { Router } from "express";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import {
  buildChartDatasets,
  buildPlan,
  completeWorkout,
  createConfig,
  getConfig,
  getWeekLabels,
  updateTrainingMax,
} from "../services/workoutService.js";

const router = Router();
router.use(apiAuth);

router.get(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const [lifts, configs, weekLabels] = await Promise.all([
      prisma.coreWorkout.findMany({ where: { userId } }),
      prisma.userLiftConfig.findMany({ where: { userId } }),
      getWeekLabels(userId),
    ]);
    const configByLiftId = Object.fromEntries(configs.map((c) => [c.liftId, c]));
    sendData(
      res,
      lifts.map((lift) => {
        const config = configByLiftId[lift.id] ?? null;
        return {
          id: lift.id,
          name: lift.name,
          trainingMax: config?.trainingMax ?? null,
          currentWeek: config?.currentWeek ?? null,
          weekLabel: weekLabels[lift.id] ?? null,
        };
      })
    );
  })
);

router.post(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const name = String(req.body?.name ?? "").trim();
    if (!name || name.length > 60) throw badRequest("Enter a lift name (1-60 characters)");
    const lift = await prisma.coreWorkout.create({ data: { name, userId } });
    sendData(res, { id: lift.id, name: lift.name, trainingMax: null, currentWeek: null }, 201);
  })
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const lift = await prisma.coreWorkout.findFirst({ where: { id, userId } });
    if (!lift) throw notFound("Lift not found");

    const auxLifts = await prisma.auxLift.findMany({ where: { liftId: id }, select: { id: true } });
    const auxIds = auxLifts.map((a) => a.id);
    if (auxIds.length) await prisma.auxLiftLog.deleteMany({ where: { auxLiftId: { in: auxIds } } });
    await prisma.auxLift.deleteMany({ where: { liftId: id } });
    await prisma.userLiftConfig.deleteMany({ where: { liftId: id } });
    await prisma.workoutLog.deleteMany({ where: { liftId: id } });
    await prisma.trainingMaxLog.deleteMany({ where: { liftId: id } });
    await prisma.coreWorkout.delete({ where: { id } });
    sendData(res, { ok: true });
  })
);

router.get(
  "/:id/plan",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const liftId = intParam(req.params.id);
    const lift = await prisma.coreWorkout.findFirst({ where: { id: liftId, userId } });
    if (!lift) throw notFound("Lift not found");
    const config = await getConfig(userId, liftId);
    if (!config) return sendData(res, { configured: false });
    const plan = await buildPlan(config, lift);
    sendData(res, { configured: true, ...plan });
  })
);

router.post(
  "/:id/setup",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const liftId = intParam(req.params.id);
    const trainingMax = Number(req.body?.trainingMax);
    if (!Number.isFinite(trainingMax) || trainingMax < 45) throw badRequest("Enter a training max of at least 45 lbs");

    const lift = await prisma.coreWorkout.findFirst({ where: { id: liftId, userId } });
    if (!lift) throw notFound("Lift not found");

    await createConfig(userId, lift, trainingMax, req.body?.loggedOn);
    await prisma.auxLift.deleteMany({ where: { userId, liftId } });
    sendData(res, { ok: true }, 201);
  })
);

router.post(
  "/:id/training-max",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const liftId = intParam(req.params.id);
    const trainingMax = Number(req.body?.trainingMax);
    if (!Number.isFinite(trainingMax) || trainingMax < 45) throw badRequest("Enter a training max of at least 45 lbs");

    const lift = await prisma.coreWorkout.findFirst({ where: { id: liftId, userId } });
    if (!lift) throw notFound("Lift not found");

    const config = await getConfig(userId, liftId);
    if (config) await updateTrainingMax(config, trainingMax, req.body?.loggedOn);
    else await createConfig(userId, lift, trainingMax, req.body?.loggedOn);
    await prisma.auxLift.deleteMany({ where: { userId, liftId } });
    sendData(res, { ok: true });
  })
);

router.post(
  "/:id/complete",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const liftId = intParam(req.params.id);
    const amrapReps = Number(req.body?.amrapReps);
    if (!Number.isInteger(amrapReps) || amrapReps < 0) throw badRequest("Enter the AMRAP reps completed");

    const config = await getConfig(userId, liftId);
    if (!config) throw notFound("Lift is not set up yet");

    const result = await completeWorkout(config, amrapReps, req.body?.loggedOn);
    await prisma.auxLift.deleteMany({ where: { userId, liftId } });
    sendData(res, result);
  })
);

router.get(
  "/history",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const logs = await prisma.workoutLog.findMany({
      where: { userId },
      include: { lift: true },
      orderBy: [{ completedOn: "desc" }, { id: "desc" }],
      take: 100,
    });
    sendData(
      res,
      logs.map((l) => ({
        id: l.id,
        liftName: l.lift.name,
        week: l.week,
        amrapReps: l.amrapReps,
        completedOn: l.completedOn,
        topSetWeight: l.topSetWeight,
        estimatedOneRepMax: l.estimatedOneRepMax,
        isPr: l.isPr,
      }))
    );
  })
);

router.get(
  "/chart",
  handler(async (req, res) => {
    sendData(res, await buildChartDatasets(currentUser(req).userId));
  })
);

export default router;
