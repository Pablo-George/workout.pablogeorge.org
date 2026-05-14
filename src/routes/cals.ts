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

    if (hasManualCals) {
      description = context ?? "Food entry";
      calories = manualCals;
    } else if (file) {
      const estimate = await estimateCalories(file.buffer, file.mimetype, context);
      description = estimate.description;
      calories = estimate.calories;
      proteinG = estimate.proteinG;
      carbsG = estimate.carbsG;
    } else {
      const estimate = await estimateCaloriesFromText(context!);
      description = estimate.description;
      calories = estimate.calories;
      proteinG = estimate.proteinG;
      carbsG = estimate.carbsG;
    }

    await prisma.calorieEntry.create({
      data: {
        userId: user.userId,
        description,
        calories,
        proteinG,
        carbsG,
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

router.post("/cals/delete/:id", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const id = parseInt(req.params.id);

  await prisma.calorieEntry.deleteMany({ where: { id, userId: user.userId } });

  res.redirect("/#tab-cals");
});

export default router;
