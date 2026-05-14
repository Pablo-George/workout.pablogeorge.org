import { Router, type Request } from "express";

const isHTMX = (req: Request) => req.headers["hx-request"] === "true";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { buildPlan, createConfig, getConfig, updateTrainingMax, completeWorkout } from "../services/workoutService.js";
import { getAuxLifts } from "../services/auxLiftService.js";
import { generateGuideImage } from "../services/guideService.js";

const router = Router();

router.get("/workout/:liftId", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (!lift) return res.redirect("/");

  const config = await getConfig(user.userId, liftId);

  let auxLifts: Awaited<ReturnType<typeof getAuxLifts>> = [];
  if (config) {
    const saved = await prisma.auxLift.findMany({
      where: { userId: user.userId, liftId },
      orderBy: { displayOrder: "asc" },
    });
    if (saved.length > 0) {
      auxLifts = saved.map((a) => ({
        name: a.name,
        description: a.description,
        setsReps: a.setsReps,
        weightRecommendation: a.weightRecommendation,
        youtubeSearchUrl: a.youtubeSearchUrl,
        displayOrder: a.displayOrder,
      }));
    } else {
      try {
        auxLifts = await getAuxLifts(lift, config.trainingMax);
        await prisma.auxLift.createMany({
          data: auxLifts.map((a) => ({
            userId: user.userId,
            liftId,
            name: a.name,
            description: a.description,
            setsReps: a.setsReps,
            weightRecommendation: a.weightRecommendation,
            youtubeSearchUrl: a.youtubeSearchUrl,
            displayOrder: a.displayOrder,
          })),
        });
      } catch (err) {
        console.error("Failed to load aux lifts:", err);
      }
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
  await prisma.auxLift.deleteMany({ where: { userId: user.userId, liftId } });
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

  if (isHTMX(req)) {
    const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
    const config = await getConfig(user.userId, liftId);
    return res.render("partials/lift-card", { w: { id: liftId, name: lift?.name ?? "", trainingMax: config?.trainingMax ?? null, currentWeek: week } });
  }
  res.redirect("/#tab-profile");
});

router.post("/workout/:liftId/update-tm", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const trainingMax = parseFloat(req.body.trainingMax as string);

  if (isNaN(trainingMax) || trainingMax < 45) return res.redirect("/#tab-profile");

  const lift = await prisma.coreWorkout.findUnique({ where: { id: liftId } });
  if (lift) {
    const config = await getConfig(user.userId, liftId);
    if (config) {
      await updateTrainingMax(config, trainingMax);
    } else {
      await createConfig(user.userId, lift, trainingMax);
    }
    await prisma.auxLift.deleteMany({ where: { userId: user.userId, liftId } });
  }

  if (isHTMX(req)) {
    const config = await getConfig(user.userId, liftId);
    return res.render("partials/lift-card", { w: { id: liftId, name: lift?.name ?? "", trainingMax, currentWeek: config?.currentWeek ?? 1 } });
  }
  res.redirect("/#tab-profile");
});

router.post("/workout/:liftId/complete", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const liftId = parseInt(req.params.liftId);
  const amrapReps = parseInt(req.body.amrapReps as string);

  const config = await getConfig(user.userId, liftId);
  if (config) await completeWorkout(config, amrapReps);

  await prisma.auxLift.deleteMany({ where: { userId: user.userId, liftId } });

  res.redirect("/");
});

router.get("/workout/guide/:liftName", ensureAuth, async (req, res) => {
  const liftName = req.params.liftName.trim();
  const cacheKey = liftName.toLowerCase();

  const existing = await prisma.exerciseGuide.findUnique({ where: { liftName: cacheKey } });
  if (existing) return res.json({ imageUrl: existing.imageUrl });

  try {
    const imageUrl = await generateGuideImage(liftName);
    await prisma.exerciseGuide.create({ data: { liftName: cacheKey, imageUrl } });
    res.json({ imageUrl });
  } catch (err) {
    console.error("Guide generation failed:", err);
    res.status(500).json({ error: "Failed to generate guide" });
  }
});

export default router;
