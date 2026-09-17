import { Router } from "express";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { resolveLocalDate } from "../lib/dates.js";

const router = Router();
router.use(apiAuth);

router.get(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const exercises = await prisma.calisthenicsExercise.findMany({ where: { userId }, orderBy: { displayOrder: "asc" } });
    const today = resolveLocalDate(undefined);
    const todayLogs = await prisma.calisthenicsLog.findMany({
      where: { completedOn: today, exerciseId: { in: exercises.map((e) => e.id) } },
    });
    const totalByExercise = new Map(todayLogs.map((l) => [l.exerciseId, l.reps]));
    sendData(
      res,
      exercises.map((e) => ({ id: e.id, name: e.name, todayTotal: totalByExercise.get(e.id) ?? 0 }))
    );
  })
);

router.post(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const name = String(req.body?.name ?? "").trim();
    if (!name || name.length > 60) throw badRequest("Enter an exercise name (1-60 characters)");
    const count = await prisma.calisthenicsExercise.count({ where: { userId } });
    const exercise = await prisma.calisthenicsExercise.create({ data: { userId, name, displayOrder: count } });
    sendData(res, { id: exercise.id, name: exercise.name, todayTotal: 0 }, 201);
  })
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id, userId } });
    if (!exercise) throw notFound("Exercise not found");
    await prisma.calisthenicsLog.deleteMany({ where: { exerciseId: id, userId } });
    await prisma.calisthenicsExercise.delete({ where: { id } });
    sendData(res, { ok: true });
  })
);

// Adds `reps` (may be negative) to today's running total, same semantics as
// the web app's stepper/quick-add buttons.
router.post(
  "/:id/log",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const exerciseId = intParam(req.params.id);
    const reps = Number(req.body?.reps);
    if (!Number.isInteger(reps) || reps === 0 || Math.abs(reps) > 10000) throw badRequest("Invalid rep count");

    const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id: exerciseId, userId } });
    if (!exercise) throw notFound("Exercise not found");

    const completedOn = resolveLocalDate(req.body?.loggedOn);
    const existing = await prisma.calisthenicsLog.findFirst({ where: { exerciseId, completedOn } });
    const newTotal = Math.max(0, (existing?.reps ?? 0) + reps);
    await prisma.calisthenicsLog.upsert({
      where: { exerciseId_completedOn: { exerciseId, completedOn } },
      update: { reps: newTotal },
      create: { userId, exerciseId, reps: newTotal, completedOn },
    });
    sendData(res, { id: exerciseId, todayTotal: newTotal });
  })
);

// Overwrites today's total directly, for correcting a mistake.
router.post(
  "/:id/total",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const exerciseId = intParam(req.params.id);
    const total = Number(req.body?.total);
    if (!Number.isInteger(total) || total < 0 || total > 100000) throw badRequest("Invalid total");

    const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id: exerciseId, userId } });
    if (!exercise) throw notFound("Exercise not found");

    const completedOn = resolveLocalDate(req.body?.loggedOn);
    await prisma.calisthenicsLog.upsert({
      where: { exerciseId_completedOn: { exerciseId, completedOn } },
      update: { reps: total },
      create: { userId, exerciseId, reps: total, completedOn },
    });
    sendData(res, { id: exerciseId, todayTotal: total });
  })
);

router.get(
  "/chart",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const exercises = await prisma.calisthenicsExercise.findMany({ where: { userId }, orderBy: { displayOrder: "asc" } });
    if (exercises.length === 0) return sendData(res, []);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const logs = await prisma.calisthenicsLog.findMany({
      where: { exerciseId: { in: exercises.map((e) => e.id) }, completedOn: { gte: thirtyDaysAgo.toISOString().split("T")[0] } },
      orderBy: { completedOn: "asc" },
    });
    const byExercise = new Map<number, { x: string; y: number }[]>();
    for (const log of logs) {
      const points = byExercise.get(log.exerciseId) ?? [];
      points.push({ x: log.completedOn, y: log.reps });
      byExercise.set(log.exerciseId, points);
    }
    sendData(
      res,
      exercises
        .filter((e) => (byExercise.get(e.id) ?? []).length > 0)
        .map((e) => ({ label: e.name, points: byExercise.get(e.id) ?? [] }))
    );
  })
);

export default router;
