import { Router, type Request } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { resolveLocalDate } from "../lib/dates.js";

const isHTMX = (req: Request) => req.headers["hx-request"] === "true";

const router = Router();

async function cardData(userId: string, exerciseId: number) {
  const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id: exerciseId, userId } });
  if (!exercise) return null;
  const today = resolveLocalDate(undefined);
  const todayLog = await prisma.calisthenicsLog.findFirst({ where: { exerciseId, completedOn: today } });
  return { exercise, todayTotal: todayLog?.reps ?? 0 };
}

router.post("/calisthenics/exercises", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const name = (req.body.name as string)?.trim();
  if (!name || name.length > 60) return res.redirect("/#tab-workouts");

  const count = await prisma.calisthenicsExercise.count({ where: { userId: user.userId } });
  const exercise = await prisma.calisthenicsExercise.create({
    data: { userId: user.userId, name, displayOrder: count },
  });

  if (isHTMX(req)) return res.render("partials/calisthenics-card", { exercise, todayTotal: 0 });
  res.redirect("/#tab-workouts");
});

router.post("/calisthenics/exercises/delete", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.body.id as string);

  await prisma.calisthenicsLog.deleteMany({ where: { exerciseId: id, userId: user.userId } });
  await prisma.calisthenicsExercise.deleteMany({ where: { id, userId: user.userId } });

  if (isHTMX(req)) {
    res.set("HX-Trigger", "charts-updated");
    return res.send("");
  }
  res.redirect("/#tab-workouts");
});

// Adds `reps` to today's running total for the exercise (e.g. 5 in the
// morning, 5 later — the card shows 10). `reps` may be negative (the minus
// stepper) to walk the total back down; it's clamped so it never goes below 0.
router.post("/calisthenics/log", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const exerciseId = parseInt(req.body.exerciseId as string);
  const reps = parseInt(req.body.reps as string);

  if (!isNaN(reps) && reps !== 0 && Math.abs(reps) <= 10000) {
    const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id: exerciseId, userId: user.userId } });
    if (exercise) {
      const completedOn = resolveLocalDate(req.body.loggedOn);
      const existing = await prisma.calisthenicsLog.findFirst({ where: { exerciseId, completedOn } });
      const newTotal = Math.max(0, (existing?.reps ?? 0) + reps);
      await prisma.calisthenicsLog.upsert({
        where: { exerciseId_completedOn: { exerciseId, completedOn } },
        update: { reps: newTotal },
        create: { userId: user.userId, exerciseId, reps: newTotal, completedOn },
      });
    }
  }

  if (isHTMX(req)) {
    res.set("HX-Trigger", "charts-updated");
    const data = await cardData(user.userId, exerciseId);
    if (data) return res.render("partials/calisthenics-card", data);
    return res.send("");
  }
  res.redirect("/#tab-workouts");
});

// Overwrites today's total directly — for correcting a mistake (e.g. fat-fingered +50 instead of +5).
router.post("/calisthenics/log/edit", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const exerciseId = parseInt(req.body.exerciseId as string);
  const total = parseInt(req.body.total as string);

  if (!isNaN(total) && total >= 0 && total <= 100000) {
    const exercise = await prisma.calisthenicsExercise.findFirst({ where: { id: exerciseId, userId: user.userId } });
    if (exercise) {
      const completedOn = resolveLocalDate(req.body.loggedOn);
      await prisma.calisthenicsLog.upsert({
        where: { exerciseId_completedOn: { exerciseId, completedOn } },
        update: { reps: total },
        create: { userId: user.userId, exerciseId, reps: total, completedOn },
      });
    }
  }

  if (isHTMX(req)) {
    res.set("HX-Trigger", "charts-updated");
    const data = await cardData(user.userId, exerciseId);
    if (data) return res.render("partials/calisthenics-card", data);
    return res.send("");
  }
  res.redirect("/#tab-workouts");
});

export default router;
