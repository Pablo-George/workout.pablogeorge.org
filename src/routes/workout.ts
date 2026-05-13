import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { buildPlan, createConfig, getConfig, updateTrainingMax, completeWorkout } from "../services/workoutService.js";
import { getAuxLifts } from "../services/auxLiftService.js";

const router = Router();

router.get("/workout/:liftId", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift) return res.redirect("/");

  const config = await getConfig(user.userId, liftId);

  let auxLifts: Awaited<ReturnType<typeof getAuxLifts>> = [];
  if (config) {
    try {
      auxLifts = await getAuxLifts(lift, config.trainingMax);
    } catch (err) {
      console.error("Failed to load aux lifts:", err);
    }
  }

  res.render("workout", {
    user,
    lift,
    needsSetup: !config,
    plan: config ? await buildPlan(config, lift) : null,
    auxLifts,
  });
});

router.post("/workout/:liftId/setup", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const trainingMax = parseFloat(req.body.trainingMax as string);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift) return res.redirect("/");

  await createConfig(user.userId, lift, trainingMax);
  res.redirect(`/workout/${liftId}`);
});

router.post("/workout/:liftId/set-week", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const week = parseInt(req.body.week as string);

  if (week >= 1 && week <= 4) {
    const config = await getConfig(user.userId, liftId);
    if (config) {
      await prisma.userLiftConfig.update({ where: { id: config.id }, data: { currentWeek: week } });
    }
  }

  res.redirect("/#tab-profile");
});

router.post("/workout/:liftId/update-tm", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const trainingMax = parseFloat(req.body.trainingMax as string);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (lift) {
    const config = await getConfig(user.userId, liftId);
    if (config) {
      await updateTrainingMax(config, trainingMax);
    } else {
      await createConfig(user.userId, lift, trainingMax);
    }
  }

  res.redirect("/#tab-profile");
});

router.post("/workout/:liftId/complete", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const amrapReps = parseInt(req.body.amrapReps as string);

  const config = await getConfig(user.userId, liftId);
  if (config) await completeWorkout(config, amrapReps);

  res.redirect("/");
});

export default router;
