import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { prisma } from "../app.js";
import { estimateCalories } from "../services/calService.js";
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

  if (!file) return res.redirect("/#tab-cals");

  try {
    const estimate = await estimateCalories(file.buffer, file.mimetype);
    const imageUrl = await uploadImage(file);

    await prisma.calorieEntry.create({
      data: {
        userId: user.userId,
        description: estimate.description,
        calories: estimate.calories,
        imageUrl,
        loggedOn: new Date().toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("Failed to estimate calories:", err);
  }

  res.redirect("/#tab-cals");
});

router.post("/cals/manual", ensureAuth, async (req, res) => {
  const user = req.user as any;
  const description = (req.body.description as string)?.trim();
  const calories = parseInt(req.body.calories as string);

  if (description && calories > 0) {
    await prisma.calorieEntry.create({
      data: {
        userId: user.userId,
        description,
        calories,
        loggedOn: new Date().toISOString().split("T")[0],
      },
    });
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
