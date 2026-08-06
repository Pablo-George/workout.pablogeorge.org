import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { estimateCalories, estimateCaloriesFromText } from "../services/calService.js";
import { uploadImage } from "../services/imageStorageService.js";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/cals/log", ensureAuth, upload.single("image"), async (req, res) => {
  const user = req.user as any;
  const file = req.file;
  const context = (req.body.context as string)?.trim() || undefined;
  const manualCals = parseInt(req.body.calories as string);
  const hasManualCals = !isNaN(manualCals) && manualCals > 0;

  if (!file && !context) return res.redirect("/#tab-cals");

  try {
    let description: string;
    let calories: number;
    let imageUrl: string | undefined;

    if (file) {
      imageUrl = await uploadImage(file);
    }

    let proteinG: number | null = null;
    let carbsG: number | null = null;
    let breakdown: string | null = null;

    if (hasManualCals) {
      description = context ?? "Food entry";
      calories = manualCals;
    } else if (file) {
      const estimate = await estimateCalories(file.buffer, file.mimetype, context);
      description = estimate.description;
      calories = estimate.calories;
      proteinG = estimate.proteinG;
      carbsG = estimate.carbsG;
      breakdown = JSON.stringify(estimate.breakdown);
    } else {
      const estimate = await estimateCaloriesFromText(context!);
      description = estimate.description;
      calories = estimate.calories;
      proteinG = estimate.proteinG;
      carbsG = estimate.carbsG;
      breakdown = JSON.stringify(estimate.breakdown);
    }

    await prisma.calorieEntry.create({
      data: {
        userId: user.userId,
        description,
        calories,
        proteinG,
        carbsG,
        breakdown,
        imageUrl: imageUrl ?? null,
        loggedOn: new Date().toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("Failed to log calories:", err);
    return res.redirect("/?cals_error=1#tab-cals");
  }

  res.redirect("/#tab-cals");
});

router.post("/cals/update/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);
  const description = (req.body.description as string)?.trim();
  const calories = parseInt(req.body.calories as string);
  const proteinG = parseInt(req.body.proteinG as string);
  const carbsG = parseInt(req.body.carbsG as string);

  const entry = await prisma.calorieEntry.findFirst({ where: { id, userId: user.userId } });
  if (!entry) return res.status(404).json({ error: "Not found" });

  await prisma.calorieEntry.update({
    where: { id },
    data: {
      description: description || entry.description,
      calories: isNaN(calories) ? entry.calories : calories,
      proteinG: isNaN(proteinG) ? null : proteinG,
      carbsG: isNaN(carbsG) ? null : carbsG,
    },
  });

  res.json({ ok: true });
});

router.post("/cals/delete/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);

  await prisma.calorieEntry.deleteMany({ where: { id, userId: user.userId } });

  res.redirect("/#tab-cals");
});

export default router;
