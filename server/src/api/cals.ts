import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { apiAuth, currentUser } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import { estimateCalories, estimateCaloriesFromText } from "../services/calService.js";
import { uploadImage } from "../services/imageStorageService.js";
import { resolveLocalDate } from "../lib/dates.js";

const router = Router();
router.use(apiAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get(
  "/",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const loggedOn = typeof req.query.date === "string" ? req.query.date : resolveLocalDate(undefined);
    const entries = await prisma.calorieEntry.findMany({ where: { userId, loggedOn }, orderBy: { createdAt: "asc" } });
    sendData(res, {
      loggedOn,
      entries,
      totalCalories: entries.reduce((s, e) => s + e.calories, 0),
      totalProteinG: entries.reduce((s, e) => s + (e.proteinG ?? 0), 0),
      totalCarbsG: entries.reduce((s, e) => s + (e.carbsG ?? 0), 0),
    });
  })
);

router.get(
  "/chart",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const history = await prisma.calorieEntry.findMany({
      where: { userId, loggedOn: { gte: thirtyDaysAgo.toISOString().split("T")[0] } },
      orderBy: { loggedOn: "asc" },
    });
    const byDay: Record<string, number> = {};
    for (const e of history) byDay[e.loggedOn] = (byDay[e.loggedOn] ?? 0) + e.calories;
    sendData(res, Object.entries(byDay).map(([date, total]) => ({ date, total })));
  })
);

// Body is multipart/form-data: optional `image`, optional `context` text,
// optional manual `calories` (skips Gemini estimation entirely).
router.post(
  "/",
  upload.single("image"),
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const file = req.file;
    const context = String(req.body?.context ?? "").trim() || undefined;
    const manualCals = Number(req.body?.calories);
    const hasManualCals = Number.isFinite(manualCals) && manualCals > 0;

    if (!file && !context) throw badRequest("Provide a photo or a text description");

    const imageUrl = file ? await uploadImage(file) : null;

    let description: string;
    let calories: number;
    let proteinG: number | null = null;
    let carbsG: number | null = null;
    let breakdown: string | null = null;

    if (hasManualCals) {
      description = context ?? "Food entry";
      calories = manualCals;
    } else if (file) {
      const estimate = await estimateCalories(file.buffer, file.mimetype, context);
      ({ description, calories, proteinG, carbsG } = estimate);
      breakdown = JSON.stringify(estimate.breakdown);
    } else {
      const estimate = await estimateCaloriesFromText(context!);
      ({ description, calories, proteinG, carbsG } = estimate);
      breakdown = JSON.stringify(estimate.breakdown);
    }

    const entry = await prisma.calorieEntry.create({
      data: { userId, description, calories, proteinG, carbsG, breakdown, imageUrl, loggedOn: resolveLocalDate(undefined) },
    });
    sendData(res, entry, 201);
  })
);

router.patch(
  "/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    const entry = await prisma.calorieEntry.findFirst({ where: { id, userId } });
    if (!entry) throw notFound("Entry not found");

    const description = String(req.body?.description ?? "").trim();
    const calories = Number(req.body?.calories);
    const proteinG = Number(req.body?.proteinG);
    const carbsG = Number(req.body?.carbsG);

    const updated = await prisma.calorieEntry.update({
      where: { id },
      data: {
        description: description || entry.description,
        calories: Number.isFinite(calories) ? calories : entry.calories,
        proteinG: Number.isFinite(proteinG) ? proteinG : null,
        carbsG: Number.isFinite(carbsG) ? carbsG : null,
      },
    });
    sendData(res, updated);
  })
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.id);
    await prisma.calorieEntry.deleteMany({ where: { id, userId } });
    sendData(res, { ok: true });
  })
);

export default router;
